# CopilotKit + Mastra — Angular test harness

A navigable harness for the [Angular + Mastra](https://docs.copilotkit.ai/angular/mastra)
section of the CopilotKit docs. Every guide in the sidebar is a route, and each
route *runs* the thing its doc page teaches rather than restating it.

The agent is a Mastra agent, bridged to CopilotKit through
[`@ag-ui/mastra`](https://www.npmjs.com/package/@ag-ui/mastra).

## Requirements

| | |
| --- | --- |
| Node | >= 22.13 (developed on v24) |
| npm | v12 |
| Model key | `OPENAI_API_KEY` — the agent uses an OpenAI model |

## Install

Dependencies are needed in **both** directories. The runtime imports the Mastra
instance from `../backend/src/mastra` as source, so the backend's own
dependencies (`@mastra/core` and friends) must be installed too.

```bash
cd backend  && npm install
cd ../frontend && npm install
```

## Set the model key

`OPENAI_API_KEY` must be present in the environment of the **runtime process**.

```bash
export OPENAI_API_KEY=sk-...
```

> Because the agent is loaded in-process, nothing reads `backend/.env` — that
> file is only consulted by `mastra dev`, which this harness does not run.
> Exporting the variable (or prefixing the command with it) is what works.

## Run

From `frontend/`:

```bash
npm run dev
```

That starts both processes together and opens on **http://localhost:4200**.

| | Command | Port |
| --- | --- | --- |
| Angular dev server | `npm run start` | 4200 |
| Copilot Runtime | `npm run runtime` | 8200 |

Run them in separate terminals with the individual commands if you prefer; `npm
run dev` is just `concurrently` over the two.

## How the pieces fit

Two processes, not three — the Mastra agent runs **inside** the runtime process
rather than behind its own server:

```
Browser (Angular 22, zoneless)
  |  @copilotkit/angular — provideCopilotKit, copilot-chat, signal APIs
  |  POST http://localhost:8200/api/copilotkit
  v
Copilot Runtime  ·  localhost:8200        <- Node, frontend/server.ts
  |  agents: { default, support } -> MastraAgent.getLocalAgent({ mastra, ... })
  |  in-process — no HTTP hop
  v
Mastra agent     ·  imported from backend/src/mastra
  v
OpenAI
```

Angular has no server route of its own, so the Copilot Runtime is a separate
Node process rather than living inside the app the way it does in the React /
Next quickstart. The model key only ever reaches the runtime process — the
browser never talks to the agent directly.

`default` and `support` are the same underlying agent under two ids, so doc
snippets written against `agentId="support"` (Chat UI, Threads) run verbatim.

## Verify it works

1. Open http://localhost:4200 — the Introduction route runs a live connection
   check on load.
2. `curl http://localhost:8200/api/copilotkit/info` should report the `default`
   and `support` agents. This is the check the quickstart's troubleshooting box
   prescribes.
3. Open `/quickstart/demo` and send *Can you tell me a joke?* — tokens should
   stream in one at a time and render as markdown.

## Routes

Each route holds the notes, pass/fail criteria, and the exact source that runs.
Routes with a live feature also expose `<route>/demo`, which is the same feature
with no page chrome so it can be screen-recorded on its own.

Docs last synced **2026-08-12**.

| Route | Status | Notes |
| --- | --- | --- |
| [/](https://docs.copilotkit.ai/angular/mastra) | Reference | Landing page — orientation and a live connection check |
| [/quickstart](https://docs.copilotkit.ai/angular/mastra/quickstart) | Working | |
| [/chat-ui](https://docs.copilotkit.ai/angular/mastra/guides/chat-ui) | Working | |
| [/frontend-tools-generative-ui](https://docs.copilotkit.ai/angular/mastra/guides/frontend-tools-generative-ui) | Working | |
| [/a2ui](https://docs.copilotkit.ai/angular/mastra/guides/a2ui) | Partial | Inert until a catalog is supplied — see Known issues |
| [/voice-multimodal](https://docs.copilotkit.ai/angular/mastra/guides/voice-multimodal) | Partial | Microphone records, but no transcription service is configured |
| [/human-in-the-loop](https://docs.copilotkit.ai/angular/mastra/guides/human-in-the-loop) | Working | Tool path is live; interrupt panel idles until the agent suspends a tool |
| [/shared-state](https://docs.copilotkit.ai/angular/mastra/guides/shared-state) | Working | |
| [/threads](https://docs.copilotkit.ai/angular/mastra/guides/threads-memory-attachments-headless) | Partial · premium | Thread endpoints need an Enterprise Intelligence license |
| [/memory](https://docs.copilotkit.ai/angular/mastra/guides/threads-memory-attachments-headless) | Partial · premium | Runtime provides no memory routes, so `isAvailable()` is false |
| [/attachments](https://docs.copilotkit.ai/angular/mastra/guides/threads-memory-attachments-headless) | Working | |
| [/headless](https://docs.copilotkit.ai/angular/mastra/guides/threads-memory-attachments-headless) | Working | |

Route metadata lives in one place — [`src/app/lib/nav-config.ts`](src/app/lib/nav-config.ts).
The nav, route headers, and this table all describe a page exactly once.

## Known issues

**A2UI stays inert without a catalog.** `/api/copilotkit/info` reports
`a2uiEnabled: true`, but supplying `a2ui.catalog` is what actually registers the
`render_a2ui` renderer. The guide's catalog snippet is not self-contained, so
`app.config.ts` sets only `a2ui.recovery` and the A2UI route renders nothing.

**`SandboxFunction` variance.** `openGenerativeUI.sandboxFunctions` is typed
`SandboxFunction[]`, i.e. `SandboxFunction<Record<string, unknown>>[]`, so the
guide's `SandboxFunction<{ filter: string }>` is not assignable to it as
written. `app.config.ts` casts at the array site — the same idiom the docs use
for the equivalent `component` variance problem.

**Voice transcription fails by design.** The microphone control renders and
records, but no transcription service is configured on this runtime.

**Premium routes render locked states.** Threads and memory endpoints come from
the CopilotKit Enterprise Intelligence Platform. Without a license key the list
stays empty and the drawer renders its locked state — that is the expected
result here, not a bug.

## Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Production build into `dist/frontend` |
| `npm run test` | Unit tests via [Vitest](https://vitest.dev/) |
| `npm run gen:sources` | Regenerate the source map the routes display |

Route pages show real code read off disk at build time, so what a page displays
is byte-identical to what runs. `gen:sources` produces that map and runs
automatically before `start` and `build`. Angular's esbuild pipeline has no
`?raw` import, which is why this is a prestep rather than an import.

## Changing the agent

The agent lives in [`../backend/src/mastra`](../backend/src/mastra). Edit
`agents/index.ts` to change the model, instructions, or tools; the runtime picks
up the change on restart.

If you rename the agent, update the `agentId` in
[`server.ts`](server.ts) to match the key it is registered under in
`backend/src/mastra/index.ts`.

## Doc drift detection

`/doc-sync` keeps this repo honest about the docs it mirrors. Press **Sync docs now** (on the landing page or on `/doc-sync`) and it fetches the markdown source behind all 9 tracked doc pages, diffs each against the copy stored in `doc-snapshot/`, replaces that copy, and reports what moved — ranked by whether the change can actually break an implementation.

Doc pages are fetched by appending `.md` to their URL, which returns the authored MDX rather than the rendered HTML. Every response is checked for `text/markdown` before it is allowed near the snapshot: a URL that misses the markdown handler still answers `200` with the HTML app shell, and writing that in would destroy the baseline. A run commits all pages or none.

**Severity is decided by where the edit landed**, not how big it was:

| Level | Trigger |
|---|---|
| **High** | a changed line inside a fenced code block, a changed fence count, or a page that now 404s and is gone from the sitemap |
| **Medium** | a changed heading, changed frontmatter `title`/`description`, or prose in the same section as changed code |
| **Low** | other prose |

**Sections checked** lists every tracked page in nav order with a mark — `✓` unchanged, `!` changed, `+` stored, `✗` 404, `~` unstable, `·` not checked. Expanding a row shows the comparison: for a changed page the diff (`−` existing snapshot, `+` newly fetched), and for an unchanged one the two matching hashes, which is the evidence the check ran.

**`doc-snapshot/CHANGELOG.md`** is the record that survives a re-sync. Because syncing replaces the copy it just compared against, the run *after* a change reports nothing — so the changelog is written at the moment of discovery and never rewritten later. Only changed pages are recorded; a clean run does not touch the file. It keeps the three most recent dated entries, counted rather than aged.

**One sync date.** `syncedAt` in `doc-snapshot/manifest.json`, rewritten on every run. There is no hand-maintained date to keep in step with it.

### How it is wired on Angular

Angular has no server-action equivalent, so the boundary is plain HTTP. Everything that fetches docs or touches the snapshot lives in `frontend/src/app/lib/doc-sync/` and is imported **only** from `frontend/src/server.ts`, which exposes two endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/doc-sync` | current manifest summary + the latest report |
| `POST /api/doc-sync/run` | runs the sync, returns the result |

They sit on the SSR server rather than the Copilot Runtime because that is the Angular app's own server: `ng serve` routes through it in development (`ssr.entry` in `angular.json`) and it ships in `dist/`, so the button works in both without a second process. The browser half is `DocSyncClient`, a root-provided service holding signals — nothing in the browser bundle imports `node:fs`, which the build verifies by never resolving those modules into `dist/browser`.

**To test it**, edit any `doc-snapshot/pages/*.md` file and press the button — a line inside a code fence for High, a `##` heading for Medium, a sentence for Low. The comparison reads the stored file itself, so nothing else needs changing. Both `/doc-sync` and the changelog label the result as a local snapshot edit rather than upstream drift.

Commit `doc-snapshot/` — `pages/`, `manifest.json` and `CHANGELOG.md` are the baseline every diff is taken against. `reports/` is gitignored.

---

