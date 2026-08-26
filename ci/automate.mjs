/**
 * The pipeline entry point, used identically by a developer and by CI.
 *
 * Everything runs inside this one Node process on purpose. Each `run:` step in
 * a GitHub Actions job is its own subshell, so a server started with `&` in one
 * step is reaped before the next step begins. Spawning the servers here keeps
 * them alive for as long as the recorder needs them.
 *
 * One spawn, two services: `npm run dev` in frontend/ starts the Copilot
 * Runtime (server.ts, :8200) and `ng serve` (:4200) together under
 * concurrently, because Angular has no server route to host the runtime the way
 * a Next app does. There is no third process — the Mastra agent is imported as
 * source by server.ts and runs inside the runtime.
 *
 * Flags:
 *   --pull               git pull before running
 *   --upgrade            upgrade dependencies rather than installing the lockfile
 *   --skip-install       skip dependency installation entirely
 *   --ignore-doc-drift   record even if the live docs have moved (alias: --force)
 *   --allow-port-reuse   record against servers that are already running
 *   --skip-credential-check  bypass the model-credential preflight
 *
 * Anything else is forwarded to the recorder (e.g. --shard=1/3, --pages=a,b).
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkAllDocDrift } from './check-doc-drift.mjs';
import {
  BACKEND_DIR,
  FRONTEND_DIR,
  FRONTEND_PORT,
  FRONTEND_URL,
  LOGS_DIR,
  RECORDER_DIR,
  ROOT_DIR,
  RUNTIME_HEALTH_URL,
  isWindows,
} from './lib/config.mjs';
import { loadEnvFiles } from './lib/env.mjs';
import {
  assertModelCredentials,
  assertPortsFree,
  warmFrontendRoutes,
  warmRuntimeEndpoint,
} from './lib/preflight.mjs';
import { muxAudioFiles } from './lib/mux.mjs';
import { generateReport } from './lib/report.mjs';

const OWN_FLAGS = [
  '--pull',
  '--upgrade',
  '--skip-install',
  '--ignore-doc-drift',
  '--force',
  '--allow-port-reuse',
  '--skip-credential-check',
];

/**
 * How the frontend, agent and recorder are installed.
 *
 * `--legacy-peer-deps` is not a workaround bolted on here: it is how both
 * READMEs document installing this repo, and therefore the only resolution its
 * committed dependency set has ever been checked against. A plain `npm install`
 * is stricter than any install this project has actually had, so CI fails on
 * peer conflicts no local run has ever hit — which is what happened on the
 * first clean run.
 *
 * It hides real conflicts, so it is not a licence to ignore them: a peer error
 * that still appears here means a pin is wrong, and belongs fixed in the
 * package.json rather than silenced twice.
 */
const NPM_INSTALL = 'npm install --legacy-peer-deps';

const args = process.argv.slice(2);
const shouldPull = args.includes('--pull');
const shouldUpgrade = args.includes('--upgrade');
const skipInstall = args.includes('--skip-install');
const ignoreDocDrift = args.includes('--ignore-doc-drift') || args.includes('--force');
const allowPortReuse = args.includes('--allow-port-reuse');
const skipCredentialCheck = args.includes('--skip-credential-check');
// `--force` also means "record anyway" to the recorder, so it is forwarded.
const forwardArgs = args.filter((a) => !OWN_FLAGS.includes(a) || a === '--force');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🚀 CopilotKit Mastra + Angular Automation Pipeline');
console.log('═══════════════════════════════════════════════════════════════');

let frontendProc = null;
let logHandles = [];

function killTree(proc, signal = 'SIGTERM') {
  if (!proc || !proc.pid) return;
  try {
    if (isWindows) {
      execSync(`taskkill /pid ${proc.pid} /T /F 2>nul || exit 0`, { stdio: 'ignore' });
    } else {
      try {
        process.kill(-proc.pid, signal);
      } catch {
        proc.kill(signal);
      }
    }
  } catch {
    try {
      proc.kill(signal);
    } catch {
      // ignore
    }
  }
}

function cleanup() {
  if (frontendProc) {
    console.log('\n🧹 Cleaning up running processes...');
  }
  // The whole tree, not just the shell: `npm run dev` is concurrently, which
  // owns the runtime and ng serve as children. Killing the parent alone leaves
  // two servers holding 8200 and 4200, and the next run refuses to start.
  if (frontendProc) {
    killTree(frontendProc);
    frontendProc = null;
  }
  for (const fd of logHandles) {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore
    }
  }
  logHandles = [];
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});
process.on('exit', cleanup);

function runSync(command, cwd, description) {
  console.log(`\n▶ [Step] ${description}...`);
  try {
    execSync(command, { cwd, stdio: 'inherit', shell: true });
  } catch (err) {
    console.error(`❌ Failed during: ${description}`);
    throw err;
  }
}

/**
 * Start a server with its output going to a file.
 *
 * Piping a server's stdio through Node deadlocks once the OS pipe buffer fills,
 * but discarding it entirely means a server that dies mid-run leaves no trace
 * at all. A file gets both: no buffer to fill, and a log to attach to the run
 * artifacts.
 */
function spawnServer(command, cwd, logName) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, logName);
  const fd = fs.openSync(logPath, 'w');
  logHandles.push(fd);

  const proc = spawn(command, {
    cwd,
    stdio: ['ignore', fd, fd],
    shell: true,
    detached: !isWindows,
  });
  return { proc, logPath };
}

function tailLog(logPath, lines = 25) {
  try {
    const content = fs.readFileSync(logPath, 'utf8').trimEnd().split(/\r?\n/);
    return content.slice(-lines).join('\n');
  } catch {
    return '(no log captured)';
  }
}

async function waitForHealth(url, name, logPath, timeoutMs = 60000) {
  const start = Date.now();
  process.stdout.write(`⏳ Waiting for ${name} (${url})... `);
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        process.stdout.write(`✅ READY (${elapsed}s)!\n`);
        return { ok: true, elapsedSec: Number(elapsed) };
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.stdout.write('.');
  }
  process.stdout.write('❌ TIMEOUT\n');
  console.error(`\n──── last lines of ${path.basename(logPath)} ────`);
  console.error(tailLog(logPath));
  console.error('────────────────────────────────────────────\n');
  throw new Error(`Timeout waiting for ${name} at ${url}. See ${logPath}`);
}

async function main() {
  const reportData = {
    success: false,
    driftResult: null,
    health: {},
    error: null,
    args: forwardArgs,
    upgraded: shouldUpgrade,
  };

  try {
    // 0. Live doc drift
    console.log('▶ [Step 0] Checking for live documentation drift against doc-snapshot...');
    const driftResult = await checkAllDocDrift();
    reportData.driftResult = driftResult;

    if (driftResult.drifted) {
      console.log('\n🚨 [DOC DRIFT DETECTED] Upstream documentation has changed on these pages:');
      console.log('───────────────────────────────────────────────────────────────────────────');
      for (const p of driftResult.driftedPages) {
        console.log(` • [${p.severity}] ${p.docPath}`);
        if (p.oldHash && p.newHash) {
          console.log(`   Hash: ${p.oldHash} ➔ ${p.newHash} (${p.file})`);
        }
      }
      console.log('───────────────────────────────────────────────────────────────────────────');

      if (!ignoreDocDrift) {
        console.log('⚠️ Halting so you can review the doc changes first.');
        console.log(`👉 Review in browser: http://localhost:${FRONTEND_PORT}/doc-sync`);
        console.log('👉 To run anyway, pass `--ignore-doc-drift` or `--force`.');
        generateReport(reportData);
        process.exit(2);
      }
      console.log('⚠️ --ignore-doc-drift provided. Proceeding anyway...\n');
    } else {
      console.log(
        `✅ [Doc Drift Check]: All ${driftResult.total} doc pages match the local snapshot.\n`,
      );
    }

    // 1. Preflight — fail before spending time on installs and recordings.
    const envFiles = loadEnvFiles();
    if (envFiles.length > 0) {
      console.log(`🔑 [Preflight] Loaded environment from: ${envFiles.join(', ')}`);
    }
    // `busy` records which ports were already served. With --allow-port-reuse
    // those servers are reused as-is; starting a second one on the same port is
    // precisely the failure this guard exists to prevent.
    const busy = assertPortsFree({ allowReuse: allowPortReuse });
    if (!skipCredentialCheck) {
      await assertModelCredentials();
    }

    // 2. Git pull
    if (shouldPull) {
      runSync('git pull', ROOT_DIR, 'Updating repository (git pull)');
    }

    // 3. Dependencies
    if (!skipInstall) {
      // The agent is installed, never started: frontend/server.ts imports
      // backend/src/mastra directly, so its node_modules must exist even though
      // `mastra dev` is never run.
      runSync(NPM_INSTALL, BACKEND_DIR, 'Installing Agent Dependencies');

      if (shouldUpgrade) {
        runSync(
          'npx npm-check-updates -u --peer',
          FRONTEND_DIR,
          'Upgrading frontend dependencies (ncu -u --peer)',
        );
      }

      runSync(NPM_INSTALL, FRONTEND_DIR, 'Installing Frontend Dependencies');
      runSync(NPM_INSTALL, RECORDER_DIR, 'Installing Autorecorder Dependencies');
    }

    // 4. Server — skipped when the ports are already being served.
    // One command, both processes — so either port being held means this
    // command cannot run, and both are treated as already served.
    let frontendLog = path.join(LOGS_DIR, 'frontend.log');
    if (busy.frontend || busy.runtime) {
      console.log(
        '\n▶ [Step] Copilot Runtime / Angular dev server already running; reusing them.',
      );
    } else {
      console.log('\n▶ [Step] Starting Copilot Runtime + Angular dev server (npm run dev)...');
      const frontend = spawnServer('npm run dev', FRONTEND_DIR, 'frontend.log');
      frontendProc = frontend.proc;
      frontendLog = frontend.logPath;
    }

    // 5. Health. /info lists the registered agents, so a runtime that answers
    // is also proof the in-process Mastra agent constructed.
    reportData.health.runtime = (
      await waitForHealth(RUNTIME_HEALTH_URL, 'Copilot Runtime', frontendLog, 60000)
    ).elapsedSec;
    reportData.health.frontend = (
      await waitForHealth(FRONTEND_URL, 'Angular Frontend', frontendLog, 180000)
    ).elapsedSec;

    // 6. Warm the routes and the runtime so the recorder's own preflight is not
    // racing a first load.
    await warmFrontendRoutes();
    await warmRuntimeEndpoint();

    // 7. Record
    console.log('\n▶ [Step] Running Autorecorder...');
    const recorderCmd =
      forwardArgs.length > 0 ? `npm run record -- ${forwardArgs.join(' ')}` : 'npm run record';
    runSync(recorderCmd, RECORDER_DIR, 'Executing Autorecorder');

    reportData.success = true;
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🎉 Automation completed successfully! All videos recorded.');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (err) {
    reportData.error = err.message || String(err);
    console.error('\n❌ Automation failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    muxAudioFiles();
    generateReport(reportData);
    cleanup();
  }
}

main();
