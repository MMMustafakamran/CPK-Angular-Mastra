/**
 * Copilot Runtime for this harness.
 *
 * Shape comes from the Angular quickstart's Node runtime server
 * (https://docs.copilotkit.ai/angular/mastra/quickstart), with the agent bound
 * to the Mastra backend in `../backend` — the Angular/Mastra quickstart defers
 * the backend step to "register this backend as the `default` agent".
 *
 * `@ag-ui/mastra` is the bridge: `MastraAgent` wraps a Mastra agent and speaks
 * AG-UI to the runtime, so no generic `HttpAgent` is needed. The Mastra
 * instance is imported directly from `backend/src/mastra`, so
 * `MastraAgent.getLocalAgent` runs the agent in THIS process — there is no
 * second server and no HTTP hop to the agent.
 *
 * `default` and `support` resolve to the same Mastra agent under two ids, each
 * with its own `resourceId` so their memory does not collide. `support` exists
 * so the doc snippets that use `agentId="support"` (Chat UI, Threads) run
 * verbatim.
 *
 * `a2ui: {}` enables A2UIMiddleware for every registered agent, per
 * https://docs.copilotkit.ai/angular/mastra/backend/copilot-runtime
 */
import { createServer } from "node:http";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { MastraAgent } from "@ag-ui/mastra";
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
