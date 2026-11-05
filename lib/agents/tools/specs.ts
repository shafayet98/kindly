import { z } from "zod";
import type { AgentKey } from "@/lib/agents/directory";
import { SAFETY_CATEGORIES } from "@/lib/safety/messages";

// Isomorphic tool specs: safe to import in the browser. Implementations live in handlers.ts and
// only ever run on the server, which decides the user from the authenticated session.

export type ToolSpec<P extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  parameters: P;
  /** Agents allowed to call this tool. Enforced on the server. */
  agents: readonly AgentKey[];
};

function spec<P extends z.ZodObject>(definition: ToolSpec<P>) {
  return definition;
}

export const TOOL_SPECS = {
  get_reminders: spec({
    name: "get_reminders",
    description: "List the person's active and paused reminders with their ids, times, days and channel.",
    parameters: z.object({}),
    agents: ["milo", "natalie", "theo"],
  }),
  get_goals: spec({
    name: "get_goals",
    description: "List the person's current goals.",
    parameters: z.object({}),
    agents: ["natalie", "theo", "iris"],
  }),
  trigger_safety_response: spec({
    name: "trigger_safety_response",
    description:
      "Call immediately if the person may be in danger: a possible medical emergency, thoughts of suicide or self-harm, " +
      "risk to others, or anything else urgent. Returns the exact message you must say, word for word, before anything else.",
    parameters: z.object({ category: z.enum(SAFETY_CATEGORIES) }),
    agents: ["milo", "natalie", "sarah", "theo", "iris", "clara"],
  }),
} as const;

export type ToolName = keyof typeof TOOL_SPECS;

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && Object.hasOwn(TOOL_SPECS, value);
}

export function toolsForAgent(agent: AgentKey): ToolSpec[] {
  return Object.values(TOOL_SPECS).filter((toolSpec) => toolSpec.agents.includes(agent));
}
