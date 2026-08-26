/**
 * RUN_REPORT.md / RUN_REPORT.json — the artifact a run is judged by.
 *
 * The markdown is appended to the GitHub step summary by the workflow, so it
 * has to read well on its own without the job log next to it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKEND_DIR,
  FRONTEND_DIR,
  FRONTEND_PORT,
  RUNTIME_PORT,
  VIDEOS_DIR,
} from './config.mjs';

function getPackageVersions() {
  const versions = { frontend: {}, backend: {} };
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND_DIR, 'package.json'), 'utf8'));
    versions.frontend = {
      '@copilotkit/angular': pkg.dependencies?.['@copilotkit/angular'] || 'n/a',
      '@copilotkit/runtime': pkg.dependencies?.['@copilotkit/runtime'] || 'n/a',
      '@ag-ui/mastra': pkg.dependencies?.['@ag-ui/mastra'] || 'n/a',
      '@mastra/core': pkg.dependencies?.['@mastra/core'] || 'n/a',
      '@angular/core': pkg.dependencies?.['@angular/core'] || 'n/a',
      '@angular/ssr': pkg.dependencies?.['@angular/ssr'] || 'n/a',
    };
  } catch {
    // ignore
  }
  // The agent is a TypeScript package imported by frontend/server.ts, not a
  // separate service — its versions come from backend/package.json.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'package.json'), 'utf8'));
    versions.backend = {
      '@mastra/core': pkg.dependencies?.['@mastra/core'] || 'n/a',
      '@mastra/memory': pkg.dependencies?.['@mastra/memory'] || 'n/a',
      '@ai-sdk/openai': pkg.dependencies?.['@ai-sdk/openai'] || 'n/a',
      mastra: pkg.devDependencies?.['mastra'] || 'n/a',
    };
  } catch {
    // ignore
  }
  return versions;
}

function listVideos() {
  const videos = [];
  try {
    for (const f of fs.readdirSync(VIDEOS_DIR)) {
      if (!f.endsWith('.webm') || f.startsWith('temp_')) continue;
      const stats = fs.statSync(path.join(VIDEOS_DIR, f));
      videos.push({ filename: f, sizeMB: `${(stats.size / (1024 * 1024)).toFixed(2)} MB` });
    }
  } catch {
    // ignore
  }
  return videos;
}

export function generateReport(data) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  const videos = listVideos();
  const report = {
    timestamp: new Date().toISOString(),
    status: data.success ? 'SUCCESS' : 'FAILED',
    args: data.args?.length > 0 ? data.args.join(' ') : 'all',
    upgradedPackages: Boolean(data.upgraded),
    docDrift: {
      checkedPages: data.driftResult?.total || 0,
      driftDetected: data.driftResult?.drifted || false,
      driftedPages: data.driftResult?.driftedPages || [],
    },
    packages: getPackageVersions(),
    healthChecks: data.health || {},
    videos,
    error: data.error || null,
  };

  fs.writeFileSync(
    path.join(VIDEOS_DIR, 'RUN_REPORT.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  const lines = [];
  lines.push('# 📊 CopilotKit Automation & Recording Report\n');
  lines.push(`- **Status:** ${report.status === 'SUCCESS' ? '✅ **SUCCESS**' : '❌ **FAILED**'}`);
  lines.push(`- **Generated At:** \`${report.timestamp}\``);
  lines.push(`- **Execution Mode:** \`${report.args}\``);
  lines.push(`- **Upgraded Packages:** \`${report.upgradedPackages ? 'Yes (--upgrade)' : 'No'}\`\n`);

  lines.push('## 1. 🔍 Doc Drift Check');
  if (report.docDrift.driftDetected) {
    lines.push(`⚠️ **Drift Detected** on ${report.docDrift.driftedPages.length} page(s):`);
    for (const p of report.docDrift.driftedPages) {
      lines.push(`- **[${p.severity}]** \`${p.docPath}\` (${p.file})`);
    }
  } else {
    lines.push(
      `✅ **No Doc Drift Detected:** All ${report.docDrift.checkedPages} pages match \`doc-snapshot/\`.`,
    );
  }
  lines.push('');

  lines.push('## 2. 📦 Package Versions');
  lines.push('### Frontend (`frontend/package.json`):');
  for (const [k, v] of Object.entries(report.packages.frontend)) {
    lines.push(`- **\`${k}\`**: \`${v}\``);
  }
  lines.push('\n### Agent (`backend/package.json`, imported in-process):');
  for (const [k, v] of Object.entries(report.packages.backend)) {
    lines.push(`- **\`${k}\`**: \`${v}\``);
  }
  lines.push('');

  lines.push('## 3. 🚀 Services & Health Checks');
  lines.push(
    `- **Copilot Runtime + Mastra agent (\`:${RUNTIME_PORT}/api/copilotkit/info\`):** ${
      report.healthChecks.runtime ? `✅ Healthy (${report.healthChecks.runtime}s)` : '❌ Offline'
    }`,
  );
  lines.push(
    `- **Angular Frontend (\`:${FRONTEND_PORT}\`):** ${
      report.healthChecks.frontend ? `✅ Healthy (${report.healthChecks.frontend}s)` : '❌ Offline'
    }\n`,
  );

  lines.push('## 4. 🎬 Generated Demo Videos');
  if (videos.length > 0) {
    lines.push('| Video File | Status | File Size |');
    lines.push('|---|---|---|');
    for (const v of videos) {
      lines.push(`| \`${v.filename}\` | ✅ Recorded | ${v.sizeMB} |`);
    }
  } else {
    lines.push('*No videos recorded in this run.*');
  }
  lines.push('');

  if (report.error) {
    lines.push('## ⚠️ Failure Details');
    lines.push(`\`\`\`\n${report.error}\n\`\`\`\n`);
    lines.push('Server logs for this run are attached under `videos/logs/`.');
  }

  fs.writeFileSync(path.join(VIDEOS_DIR, 'RUN_REPORT.md'), lines.join('\n'), 'utf8');
  console.log(`\n📄 Execution report saved to: ${path.join(VIDEOS_DIR, 'RUN_REPORT.md')}`);
}
