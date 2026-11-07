"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboardedPatient, requirePatient } from "@/lib/auth/session";
import { GOAL_CATEGORY_KEYS } from "@/lib/goals/categories";
import { describeGoal } from "@/lib/goals/describe";
import { parseGoal } from "@/lib/goals/parse";
import { parseItemKey } from "@/lib/goals/schedule";
import { archiveGoal, createGoal, getOwnedGoal, GoalError, goalInputSchema, markSessionDone, postponeSession, undoSession, updateGoal, type GoalInput } from "@/lib/goals/service";
import { recordAppChange } from "@/lib/plans/service";
import { createReminder, ReminderError } from "@/lib/reminders/service";
import { localDate } from "@/lib/time";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
export type DraftResult = { ok: true; draft: GoalInput } | { ok: false; error: string };

function refresh() {
  for (const path of ["/dashboard", "/goals", "/progress", "/schedule"]) revalidatePath(path);
}

async function guard<T extends ActionResult>(fn: () => Promise<T>): Promise<T | ActionResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GoalError || error instanceof ReminderError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Reads what someone typed and suggests a goal for them to check. Nothing is saved. */
export async function draftGoal(text: string): Promise<DraftResult> {
  await requirePatient();
  const input = z.string().trim().min(2).max(300).safeParse(text);
  if (!input.success) return { ok: false, error: "Tell us your goal in a few words." };
  const { draft } = await parseGoal(input.data);
  return { ok: true, draft };
}

const optionalInt = z.preprocess((value) => (value === "" || value === null ? null : value), z.coerce.number().int().min(1).max(600).nullable());

function readGoalForm(formData: FormData): GoalInput | null {
  const parsed = goalInputSchema.safeParse({
    title: formData.get("title"),
    category: z.enum(GOAL_CATEGORY_KEYS).catch("other").parse(formData.get("category")),
    cadence: formData.get("cadence"),
    targetCount: Number(formData.get("targetCount") || 1),
    daysOfWeek: formData.getAll("day").length ? formData.getAll("day").map(Number) : null,
    times: formData.getAll("time").map(String).filter(Boolean),
    durationMinutes: optionalInt.parse(formData.get("durationMinutes")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  return parsed.success ? parsed.data : null;
}

export async function saveNewGoal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requirePatient();
  const input = readGoalForm(formData);
  if (!input) return { ok: false, error: "Please check the goal: it needs a name, and times like 08:00." };
  return guard(async () => {
    const goal = await createGoal(user.id, input, { type: "patient" });
    await recordAppChange(user.id, goal.id, { kind: "create", goal: input, summary: `Added ${describeGoal(goal)}` });
    const remind = formData.get("remind");
    if (remind === "in_app" || remind === "phone") {
      const time = goal.times[0] ?? String(formData.get("remindAt") || "09:00");
      const days = goal.daysOfWeek?.length ? goal.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
      try {
        await createReminder(user.id, { title: goal.title, localTime: time, daysOfWeek: days, channel: remind, goalId: goal.id }, { type: "patient" });
      } catch (error) {
        if (error instanceof ReminderError) {
          refresh();
          return { ok: true, message: `Goal saved. ${error.message}` };
        }
        throw error;
      }
    }
    refresh();
    return { ok: true, message: "Goal saved." };
  });
}

export async function saveGoalChanges(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedPatient();
  const goalId = z.uuid().safeParse(formData.get("goalId"));
  const input = readGoalForm(formData);
  if (!goalId.success || !input) return { ok: false, error: "Please check the goal: it needs a name, and times like 08:00." };
  return guard(async () => {
    const { before, summary } = await updateGoal(user.id, goalId.data, input, { type: "patient" });
    await recordAppChange(user.id, goalId.data, { kind: "change", after: input, summary, beforeTitle: before.title });
    refresh();
    return { ok: true, message: "Saved. Changes apply from today." };
  });
}

export async function removeGoal(formData: FormData) {
  const user = await requireOnboardedPatient();
  const goalId = z.uuid().safeParse(formData.get("goalId"));
  if (!goalId.success) return;
  await guard(async () => {
    await archiveGoal(user.id, goalId.data, { type: "patient" });
    return { ok: true } as const;
  });
  refresh();
}

// ---------- Calendar ----------

function sessionRef(key: string) {
  const ref = parseItemKey(key);
  return ref && z.uuid().safeParse(ref.goalId).success ? ref : null;
}

export async function markDone(key: string): Promise<ActionResult> {
  const user = await requireOnboardedPatient();
  const ref = sessionRef(key);
  if (!ref) return { ok: false, error: "That session wasn't found." };
  return guard(async () => {
    await markSessionDone(user.id, ref, {}, { type: "patient" });
    refresh();
    return { ok: true, message: "Marked as done." };
  });
}

/** For goals counted per week or month: "I did one today". */
export async function logOneToday(goalId: string): Promise<ActionResult> {
  const user = await requireOnboardedPatient();
  if (!z.uuid().safeParse(goalId).success || !(await getOwnedGoal(user.id, goalId))) return { ok: false, error: "That goal wasn't found." };
  return guard(async () => {
    await markSessionDone(user.id, { goalId, date: localDate(new Date(), user.timezone) }, {}, { type: "patient" });
    refresh();
    return { ok: true, message: "Nice. Counted for today." };
  });
}

export async function undo(key: string): Promise<ActionResult> {
  const user = await requireOnboardedPatient();
  const ref = sessionRef(key);
  if (!ref) return { ok: false, error: "That session wasn't found." };
  return guard(async () => {
    await undoSession(user.id, ref, { type: "patient" });
    refresh();
    return { ok: true, message: "Undone." };
  });
}

export async function moveSession(key: string, toDate: string, toTime: string): Promise<ActionResult> {
  const user = await requireOnboardedPatient();
  const ref = sessionRef(key);
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(toDate);
  const time = z.union([z.literal(""), z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)]).safeParse(toTime);
  if (!ref || !date.success || !time.success) return { ok: false, error: "Choose a day and time." };
  return guard(async () => {
    await postponeSession(user.id, ref, { date: date.data, time: time.data || null }, { type: "patient" });
    refresh();
    return { ok: true, message: "Moved, just this once." };
  });
}
