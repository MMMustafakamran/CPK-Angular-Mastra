/**
 * Copilot Runtime for this harness.
 *
 * Shape comes from the Angular quickstart's Node runtime server
 * (https://docs.copilotkit.ai/angular/mastra/quickstart), with the agent bound
 * to the Mastra backend in `../backend` — the Angular/Mastra quickstart defers
 * the backend step to "register this backend as the `default` agent".
 *
 * That backend is a standard Mastra project (`mastra dev`), which serves its
 * registered agents over Mastra's HTTP API on port 4111 rather than a raw AG-UI
 * endpoint. `@ag-ui/mastra` is the bridge: `MastraAgent` wraps a Mastra agent
 * handle and speaks AG-UI to the runtime, so no generic `HttpAgent` is needed.
 * `MastraClient` from `@mastra/client-js` produces the remote handle for an
 * agent registered in `backend/src/mastra/index.ts`.
 *
 * `default` and `support` resolve to the same Mastra agent, each wrapped in its
 * own `MastraAgent` instance. `support` exists so the doc snippets that use
 * `agentId="support"` (Chat UI, Threads) run verbatim.
 *
 * `a2ui: {}` enables A2UIMiddleware for every registered agent, per
 * https://docs.copilotkit.ai/angular/mastra/backend/copilot-runtime
 */
import { createServer } from "node:http";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { MastraAgent } from "@ag-ui/mastra";
import { MastraClient } from "@mastra/client-js";
import { mastra } from '../backend/src/mastra';

const runtime = new CopilotRuntime({
  agents: () => ({
    default: MastraAgent.getLocalAgent({
      mastra,
      agentId: 'myAgent',
      resourceId: 'agent-1',
    }),
    support: MastraAgent.getLocalAgent({
      mastra,
      agentId: 'myAgent',
      resourceId: 'agent-2',
    }),
  }),
  a2ui: {}
});


const port = Number(process.env["PORT"] ?? 8200);

createServer(
  createCopilotNodeListener({
    runtime,
    basePath: "/api/copilotkit",
    cors: true,
  }),
).listen(port, () => {
  console.log(
    `Copilot Runtime listening at http://localhost:${port}/api/copilotkit`,
  );
});
