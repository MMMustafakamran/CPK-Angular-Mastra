import { Mastra } from "@mastra/core";
import { myAgent } from "./agents";

export const mastra = new Mastra({
  agents: { myAgent },
});