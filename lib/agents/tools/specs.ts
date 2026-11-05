import { z } from "zod";
import type { AgentKey } from "@/lib/agents/directory";
import { SAFETY_CATEGORIES } from "@/lib/safety/messages";

// Isomorphic tool specs: safe to import in the browser. Implementations live in handlers.ts and
// only ever run on the server, which decides the user from the authenticated session.

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).describe('24-hour local time, e.g. "17:00"');
const id = z.string().max(64);
const days = z.array(z.number().int().min(0).max(6)).min(1).max(7).describe("Days of the week, 0 = Sunday … 6 = Saturday");

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
  propose_reminder_change: spec({
    name: "propose_reminder_change",
    description:
      "Milo's reminder service. Propose moving, pausing, resuming or cancelling one of the person's reminders. " +
      "Nothing changes yet: read the returned summary to the person and ask them to confirm. " +
      "Get the reminder id from get_reminders first. Leave new_time and days null unless they change.",
    parameters: z.object({
      reminder_id: id,
      action: z.enum(["reschedule", "pause", "resume", "cancel"]),
      new_time: time.nullable(),
      days: days.nullable(),
    }),
    agents: ["milo", "natalie"],
  }),
  propose_new_reminder: spec({
    name: "propose_new_reminder",
    description:
      "Milo's reminder service. Propose a new reminder. Nothing is created yet: read the summary to the person and ask them to confirm.",
    parameters: z.object({
      title: z.string().min(2).max(80),
      time,
      days,
      delivery: z.enum(["in_app", "phone"]).describe("phone = Kindly calls their phone; in_app = shown in the app"),
    }),
    agents: ["milo", "natalie"],
  }),
  confirm_action: spec({
    name: "confirm_action",
    description:
      "Carry out a proposed change. Call this ONLY after the person has clearly said yes to the exact summary you read out. " +
      "Then tell them the result exactly as returned.",
    parameters: z.object({ confirmation_id: id }),
    agents: ["milo", "natalie"],
  }),
  get_call_preferences: spec({
    name: "get_call_preferences",
    description: "Whether phone calls are on or paused, quiet hours and the daily call limit.",
    parameters: z.object({}),
    agents: ["milo"],
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
