# Doc drift changelog

What the CopilotKit docs changed under this repo, written by the sync on
`/doc-sync`. Only pages that actually moved are recorded — a sync that finds
everything unchanged writes nothing here at all.

Holds the 3 most recent dated entries. When a change lands on a fourth
date, the oldest entry is dropped. Entries are counted, not aged, so a gap of
weeks between changes does not expire anything.

## 2026-08-18

### 06:58 UTC — 3 pages, highest severity high

**High — Frontend tools and generative UI** · _local snapshot edit, not an upstream change_

`/angular/mastra/guides/frontend-tools-generative-ui` · route `/frontend-tools-generative-ui` · under “Register a browser tool”

29 code lines, 9 prose lines changed.

````diff
+ Call `registerFrontendTool` from an Angular injection context. The live
+ Showcase example builds a typed tool config around a writable signal:
- 
+ return {
+ name: "change_background",
+ description: "Change the application background to a CSS gradient.",
+ parameters: z.object({
+ background: z.string().optional(),
````

**High — Threads** · _local snapshot edit, not an upstream change_

`/angular/mastra/guides/threads-memory-attachments-headless` · routes `/threads`, `/memory`, `/attachments`, `/headless` · under “Resume a specific thread” · in a `ts` block

2 code lines changed.

````diff
- 
+ import { injectThreads } from "@copilotkit/angular";
````

**Low — Voice and multimodal input** · _local snapshot edit, not an upstream change_

`/angular/mastra/guides/voice-multimodal` · route `/voice-multimodal` · under “What is voice and multimodal input?”

3 prose lines changed.

````diff
- 
+ Multimodal input attaches typed image or document content parts to that
+ message, so a compatible model can reason about more than text.
````
