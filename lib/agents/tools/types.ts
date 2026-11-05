import type { z } from "zod";
import type { AgentKey } from "@/lib/agents/directory";
import type { ToolName } from "./specs";
import { TOOL_SPECS } from "./specs";

export type ToolContext = {
  userId: string;
  sessionId: string | null;
  agent: AgentKey;
  channel: "browser" | "phone";
  timezone: string;
};

type InputOf<N extends ToolName> = z.infer<(typeof TOOL_SPECS)[N]["parameters"]>;

export type ToolHandlers = {
  [N in ToolName]: (ctx: ToolContext, input: InputOf<N>) => Promise<Record<string, unknown>>;
};
