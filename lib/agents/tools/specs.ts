import { z } from "zod";
import type { AgentKey } from "@/lib/agents/directory";
import { GOAL_CATEGORY_KEYS } from "@/lib/goals/categories";
import { SAFETY_CATEGORIES } from "@/lib/safety/messages";

// Isomorphic tool specs: safe to import in the browser. Implementations live in handlers.ts and
// only ever run on the server, which decides the user from the authenticated session.

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).describe('24-hour local time, e.g. "17:00"');
const id = z.string().max(64);
const days = z.array(z.number().int().min(0).max(6)).min(1).max(7).describe("Days of the week, 0 = Sunday … 6 = Saturday");
const times = z.array(time).max(6).describe("24-hour times, [] for any time");

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
    description: "List the person's current goals with ids, category, how often, days and times.",
    parameters: z.object({}),
    agents: ["natalie", "milo", "theo", "iris"],
  }),
  get_week_plan: spec({
    name: "get_week_plan",
    description:
      "The person's planned goal sessions for the last 7 days and the next 7 days, each with an item_id and status " +
      "(done, not_done, postponed, planned), plus counted goals (e.g. 1 of 3 this week).",
    parameters: z.object({}),
    agents: ["natalie", "milo", "theo"],
  }),
  propose_new_goal: spec({
    name: "propose_new_goal",
    description:
      "Theo's planning service. Propose a new goal from what the person said. Pick the category yourself. " +
      "Ask how often (and which days/time) first if they didn't say. Nothing is created yet: read the summary, ask them to confirm, " +
      "then call confirm_action. Afterwards, offer a reminder (propose_new_reminder with the new goal's id).",
    parameters: z.object({
      title: z.string().min(2).max(80).describe('Short, in their words: "Walk", "30 push-ups", "Take blood pressure tablets"'),
      category: z.enum(GOAL_CATEGORY_KEYS),
      cadence: z.enum(["daily", "weekly", "monthly"]).describe("daily = every day or set days; weekly = N times a week; monthly = N times a month"),
      target_count: z.number().int().min(1).max(50).describe("Sessions per day/week/month, not amounts within a session"),
      days_of_week: days.nullable().describe("Only if they chose days; null for any day"),
      times,
      duration_minutes: z.number().int().min(1).max(600).nullable(),
      notes: z.string().max(300).nullable(),
      reason_in_their_words: z.string().max(300).nullable(),
    }),
    agents: ["natalie", "theo"],
  }),
  mark_goal_done: spec({
    name: "mark_goal_done",
    description:
      "Record that the person did a goal session (\"I did my walk\", \"took my tablets\"). Use item_id from get_week_plan when you have it, " +
      "otherwise goal_id with days_ago. No confirmation needed; it's what they told you.",
    parameters: z.object({
      item_id: z.string().max(120).nullable(),
      goal_id: id.nullable(),
      days_ago: z.number().int().min(0).max(6),
      amount: z.number().min(0).max(100000).nullable(),
      unit: z.enum(["minutes", "reps", "km", "steps", "glasses", "pages"]).nullable(),
      note: z.string().max(300).nullable(),
    }),
    agents: ["natalie", "milo"],
  }),
  propose_postpone_session: spec({
    name: "propose_postpone_session",
    description:
      "Move ONE planned session to another day or time, just that once (\"move today's walk to 5 PM\"). If they want it moved every time, " +
      "change the goal with propose_plan_adjustment instead; ask if unclear. Nothing changes until confirm_action.",
    parameters: z.object({
      item_id: z.string().max(120),
      days_from_today: z.number().int().min(0).max(14),
      new_time: time.nullable(),
    }),
    agents: ["natalie", "milo"],
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
      goal_id: id.nullable().describe("The goal this reminds them about; its time and days are used when it has a set schedule"),
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
  decline_action: spec({
    name: "decline_action",
    description: "The person said no to a proposed change. Records the decision; nothing changes.",
    parameters: z.object({ confirmation_id: id }),
    agents: ["milo", "natalie"],
  }),
  log_habit: spec({
    name: "log_habit",
    description:
      "Save something the person reported about activity, food, smoking, sleep or mood. Use their own words in description. " +
      "Only fill value and unit if they said a number; never estimate calories, distances or amounts they didn't give.",
    parameters: z.object({
      kind: z.enum(["activity", "food", "smoking", "sleep", "mood", "other"]),
      description: z.string().min(1).max(300),
      value: z.number().min(0).max(100000).nullable(),
      unit: z.enum(["minutes", "hours", "cigarettes", "steps", "km", "servings"]).nullable(),
      days_ago: z.number().int().min(0).max(6).describe("0 = today, 1 = yesterday"),
      certainty: z.enum(["low", "medium", "high"]).describe("How sure the person sounded"),
    }),
    agents: ["natalie"],
  }),
  correct_habit: spec({
    name: "correct_habit",
    description: "Correct an entry the person says was wrong (e.g. 20 minutes, not 30). Get the entry id from get_recent_habits.",
    parameters: z.object({ entry_id: id, value: z.number().min(0).max(100000).nullable(), description: z.string().max(300).nullable() }),
    agents: ["natalie"],
  }),
  get_recent_habits: spec({
    name: "get_recent_habits",
    description: "The person's check-ins from the last 14 days, newest first, with entry ids.",
    parameters: z.object({}),
    agents: ["natalie"],
  }),
  get_progress: spec({
    name: "get_progress",
    description: "Iris's factual summary of the last 4 weeks: goals met per week, patterns to discuss (not conclusions), and missing data.",
    parameters: z.object({}),
    agents: ["natalie", "theo"],
  }),
  propose_plan_adjustment: spec({
    name: "propose_plan_adjustment",
    description:
      "Theo's planning service. Change one of the person's goals from now on: how often, which days, its time (e.g. a bedtime), " +
      "how long, its name or category. Use it when they ask, or after a setback once they've said what got in the way. " +
      "Get the goal id from get_goals. Leave fields null that don't change. Nothing changes yet: read the summary, ask them to confirm, then call confirm_action.",
    parameters: z.object({
      goal_id: id,
      title: z.string().min(2).max(80).nullable(),
      category: z.enum(GOAL_CATEGORY_KEYS).nullable(),
      cadence: z.enum(["daily", "weekly", "monthly"]).nullable(),
      target_count: z.number().int().min(1).max(50).nullable(),
      days_of_week: days.nullable(),
      times: z.array(time).max(6).nullable().describe('24-hour times, e.g. bedtime 10 PM = ["22:00"]; [] for any time'),
      duration_minutes: z.number().int().min(1).max(600).nullable(),
      reason_in_their_words: z.string().min(2).max(300),
    }),
    agents: ["natalie", "theo"],
  }),
  save_wellbeing_note: spec({
    name: "save_wellbeing_note",
    description:
      "Keep a short private note for the person, only after they explicitly ask or agree. Private: never shared with other companions or clinicians.",
    parameters: z.object({ note: z.string().min(2).max(600) }),
    agents: ["sarah"],
  }),
  get_wellbeing_notes: spec({
    name: "get_wellbeing_notes",
    description: "The person's private notes with you from the last 30 days.",
    parameters: z.object({}),
    agents: ["sarah"],
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
