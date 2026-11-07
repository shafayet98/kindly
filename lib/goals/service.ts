import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { scheduleNextJob } from "@/lib/scheduling/jobs";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/time";
import { GOAL_CATEGORY_KEYS } from "./categories";
import { describeGoalChange, retitleForTime } from "./describe";
import { buildItems, countProgress, hasFixedSessions, plannedSlots, type CalendarItem, type CountProgress, type GoalPlan, type SessionRow } from "./schedule";

// Goals, their versions and their sessions. Every function is scoped to the given userId, which
// callers take from the authenticated session or a server-issued call token, never from a model.

export type GoalActor = { type: "patient" } | { type: "agent"; agent: AgentKey; sessionId: string | null };
export class GoalError extends Error {}

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);

export const goalInputSchema = z.object({
  title: z.string().trim().min(2).max(80),
  category: z.enum(GOAL_CATEGORY_KEYS),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  targetCount: z.number().int().min(1).max(50),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  times: z.array(time).max(6),
  durationMinutes: z.number().int().min(1).max(600).nullable(),
  notes: z.string().trim().max(300).nullable(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

/** Makes a goal's fields consistent: e.g. a weekly goal on Mon/Wed/Fri means 3 a week. */
export function normaliseGoal(input: GoalInput): GoalInput {
  const days = input.daysOfWeek?.length ? [...new Set(input.daysOfWeek)].sort() : null;
  const times = [...new Set(input.times)].sort();
  const goal = { ...input, notes: input.notes?.trim() || null, times };
  if (goal.cadence === "monthly") return { ...goal, daysOfWeek: null, times: [] };
  if (goal.cadence === "daily") {
    return { ...goal, daysOfWeek: days && days.length < 7 ? days : null, targetCount: times.length ? times.length : goal.targetCount };
  }
  return days ? { ...goal, daysOfWeek: days, targetCount: days.length * Math.max(1, times.length) } : { ...goal, daysOfWeek: null };
}

function auditActor(userId: string, actor: GoalActor) {
  return actor.type === "patient" ? { actorUserId: userId, actorType: "patient" as const } : { actorUserId: userId, actorType: "agent" as const, actorLabel: actor.agent };
}

export async function userTimezone(userId: string) {
  const [user] = await db.select({ timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new GoalError("Unknown user.");
  return user.timezone;
}

export type Goal = typeof schema.goals.$inferSelect;

export function toPlan(goal: Goal): GoalPlan {
  return {
    id: goal.id,
    title: goal.title,
    category: goal.category,
    cadence: goal.cadence,
    targetCount: goal.targetCount,
    daysOfWeek: goal.daysOfWeek,
    times: goal.times,
    durationMinutes: goal.durationMinutes,
    notes: goal.notes,
    startsOn: goal.startsOn,
    endsOn: goal.endsOn,
    status: goal.status,
  };
}

/** The person's current goals (latest versions that haven't ended). */
export async function activeGoals(userId: string) {
  return db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active"), isNull(schema.goals.endsOn)))
    .orderBy(schema.goals.createdAt);
}

/** A goal row owned by the user (any version). */
export async function getOwnedGoal(userId: string, goalId: string) {
  const [goal] = await db.select().from(schema.goals).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
  return goal ?? null;
}

async function currentGoal(userId: string, goalId: string) {
  const goal = await getOwnedGoal(userId, goalId);
  if (!goal || goal.status !== "active" || goal.endsOn) throw new GoalError("That goal wasn't found.");
  return goal;
}

export async function createGoal(userId: string, input: GoalInput, actor: GoalActor) {
  const goal = normaliseGoal(goalInputSchema.parse(input));
  const today = localDate(new Date(), await userTimezone(userId));
  const [created] = await db
    .insert(schema.goals)
    .values({
      userId,
      ...goal,
      startsOn: today,
      createdByAgent: actor.type === "agent" ? actor.agent : null,
      createdInSessionId: actor.type === "agent" ? actor.sessionId : null,
    })
    .returning();
  await audit({ ...auditActor(userId, actor), resourceType: "goal", resourceId: created.id, action: "goal.created", result: "success" });
  return created;
}

const SCHEDULE_FIELDS = ["cadence", "targetCount", "daysOfWeek", "times"] as const;

/** Prepares a change: the goal after it, and a plain-language summary. Doesn't save anything. */
export async function previewGoalChange(userId: string, goalId: string, change: Partial<GoalInput>) {
  const goal = await currentGoal(userId, goalId);
  if (goal.approvedBy) throw new GoalError("This goal is part of a clinician-approved plan, so only the clinician can change it.");
  const merged: GoalInput = { ...toInput(goal), ...change };
  if (change.times && !change.title && goal.times.length === 1 && change.times.length === 1) {
    merged.title = retitleForTime(goal.title, goal.times[0], change.times[0]);
  }
  const after = normaliseGoal(goalInputSchema.parse(merged));
  const summary = describeGoalChange({ ...toInput(goal), category: goal.category }, { ...after, category: after.category });
  if (!summary) throw new GoalError("That wouldn't change the goal.");
  return { goal, after, summary };
}

function toInput(goal: Goal): GoalInput {
  return {
    title: goal.title,
    category: goal.category,
    cadence: goal.cadence,
    targetCount: goal.targetCount,
    daysOfWeek: goal.daysOfWeek,
    times: goal.times,
    durationMinutes: goal.durationMinutes,
    notes: goal.notes,
  };
}

/**
 * Applies a change. A schedule change starts a new version from today, so past weeks keep the plan
 * that applied then; sessions from today on move to the new version. Linked reminders follow.
 */
export async function updateGoal(userId: string, goalId: string, change: Partial<GoalInput>, actor: GoalActor) {
  const { goal, after, summary } = await previewGoalChange(userId, goalId, change);
  const today = localDate(new Date(), await userTimezone(userId));
  const scheduleChanged = SCHEDULE_FIELDS.some((field) => JSON.stringify(goal[field]) !== JSON.stringify(after[field]));

  const updated = await db.transaction(async (tx) => {
    if (!scheduleChanged || goal.startsOn >= today) {
      const [row] = await tx
        .update(schema.goals)
        .set({ ...after, planVersion: goal.planVersion + 1 })
        .where(eq(schema.goals.id, goal.id))
        .returning();
      return row;
    }
    await tx.update(schema.goals).set({ endsOn: addDays(today, -1) }).where(eq(schema.goals.id, goal.id));
    const [next] = await tx
      .insert(schema.goals)
      .values({
        userId,
        ...after,
        startsOn: today,
        previousGoalId: goal.id,
        planVersion: goal.planVersion + 1,
        createdByAgent: goal.createdByAgent,
        createdInSessionId: goal.createdInSessionId,
      })
      .returning();
    await tx.update(schema.goalSessions).set({ goalId: next.id }).where(and(eq(schema.goalSessions.goalId, goal.id), gte(schema.goalSessions.scheduledDate, today)));
    await tx.update(schema.reminders).set({ goalId: next.id }).where(eq(schema.reminders.goalId, goal.id));
    return next;
  });

  await syncLinkedReminders(updated);
  await audit({ ...auditActor(userId, actor), resourceType: "goal", resourceId: updated.id, action: "goal.changed", result: "success", metadata: { previous: goal.id } });
  return { before: goal, after: updated, summary };
}

/** Removes a goal from today on. Done sessions stay in the history; linked reminders stop. */
export async function archiveGoal(userId: string, goalId: string, actor: GoalActor) {
  const goal = await currentGoal(userId, goalId);
  const today = localDate(new Date(), await userTimezone(userId));
  await db.update(schema.goals).set({ status: "archived", endsOn: addDays(today, -1) }).where(eq(schema.goals.id, goal.id));
  const linked = await db
    .update(schema.reminders)
    .set({ status: "cancelled" })
    .where(and(eq(schema.reminders.goalId, goal.id), ne(schema.reminders.status, "cancelled")))
    .returning({ id: schema.reminders.id });
  for (const reminder of linked) await scheduleNextJob(reminder.id);
  await audit({ ...auditActor(userId, actor), resourceType: "goal", resourceId: goal.id, action: "goal.archived", result: "success" });
  return goal;
}

/** A goal-linked reminder follows its goal's schedule when the goal has a single time. */
async function syncLinkedReminders(goal: Goal) {
  if (!hasFixedSessions(goal) || goal.times.length !== 1) return;
  const days = goal.daysOfWeek?.length ? goal.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  const linked = await db
    .update(schema.reminders)
    .set({ localTime: goal.times[0], daysOfWeek: days })
    .where(and(eq(schema.reminders.goalId, goal.id), ne(schema.reminders.status, "cancelled")))
    .returning({ id: schema.reminders.id });
  for (const reminder of linked) await scheduleNextJob(reminder.id);
}

// ---------- Sessions ----------

async function rowsFor(userId: string, goalIds: string[], from: string, to: string) {
  if (!goalIds.length) return [];
  return db
    .select()
    .from(schema.goalSessions)
    .where(and(eq(schema.goalSessions.userId, userId), inArray(schema.goalSessions.goalId, goalIds), gte(schema.goalSessions.scheduledDate, from), lte(schema.goalSessions.scheduledDate, to)));
}

function toRow(row: typeof schema.goalSessions.$inferSelect): SessionRow {
  return {
    goalId: row.goalId,
    scheduledDate: row.scheduledDate,
    slotTime: row.slotTime,
    status: row.status,
    movedToDate: row.movedToDate,
    movedToTime: row.movedToTime,
    movedFromDate: row.movedFromDate,
    movedFromTime: row.movedFromTime,
    value: row.value,
    unit: row.unit,
    note: row.note,
  };
}

/** All goal versions that overlap [from, to]. */
async function goalsOverlapping(userId: string, from: string, to: string) {
  return db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), lte(schema.goals.startsOn, to), or(isNull(schema.goals.endsOn), gte(schema.goals.endsOn, from))));
}

/** Sessions and counted goals for a date range, ready for the calendar or Iris. */
export async function loadSessions(userId: string, from: string, to: string, today: string) {
  const goals = await goalsOverlapping(userId, from, to);
  // Monthly goals count the whole month, which can reach outside the range.
  const rowsFrom = `${from.slice(0, 7)}-01`;
  const rows = (await rowsFor(userId, goals.map((goal) => goal.id), rowsFrom, addDays(to, 31))).map(toRow);
  const plans = goals.map(toPlan);
  return { goals, plans, rows, items: buildItems(plans, rows, from, to, today) };
}

export type WeekView = { weekStart: string; today: string; items: CalendarItem[]; counted: CountProgress[] };

export async function loadWeek(userId: string, weekStart: string): Promise<WeekView> {
  const today = localDate(new Date(), await userTimezone(userId));
  const { plans, rows, items } = await loadSessions(userId, weekStart, addDays(weekStart, 6), today);
  return { weekStart, today, items, counted: countProgress(plans, rows, weekStart) };
}

type SlotRef = { goalId: string; date: string; slotTime?: string };
type Done = { value?: number | null; unit?: string | null; note?: string | null };

/** Records that the person did a session. Not for future dates. */
export async function markSessionDone(userId: string, ref: SlotRef, done: Done, actor: GoalActor) {
  const goal = await getOwnedGoal(userId, ref.goalId);
  if (!goal) throw new GoalError("That goal wasn't found.");
  const today = localDate(new Date(), await userTimezone(userId));
  if (ref.date > today) throw new GoalError("That's in the future, so it can't be marked done yet.");

  let slotTime = ref.slotTime;
  if (slotTime === undefined) {
    const existing = await rowsFor(userId, [goal.id], ref.date, ref.date);
    const open = plannedSlots(toPlan(goal), ref.date, ref.date)
      .map((slot) => slot.slotTime)
      .concat(existing.filter((row) => row.status === "planned").map((row) => row.slotTime))
      .find((slot) => !existing.some((row) => row.slotTime === slot && row.status !== "planned"));
    slotTime = open ?? `extra:${existing.filter((row) => row.slotTime.startsWith("extra:")).length + 1}`;
  }

  const values = {
    status: "done" as const,
    completedAt: new Date(),
    value: done.value === null || done.value === undefined ? null : String(done.value),
    unit: done.value === null || done.value === undefined ? null : (done.unit ?? null),
    note: done.note?.trim().slice(0, 300) || null,
    recordedByAgent: actor.type === "agent" ? actor.agent : null,
    sessionId: actor.type === "agent" ? actor.sessionId : null,
  };
  const [row] = await db
    .insert(schema.goalSessions)
    .values({ userId, goalId: goal.id, scheduledDate: ref.date, slotTime, ...values })
    .onConflictDoUpdate({
      target: [schema.goalSessions.goalId, schema.goalSessions.scheduledDate, schema.goalSessions.slotTime],
      set: values,
      setWhere: sql`${schema.goalSessions.status} <> 'postponed'`,
    })
    .returning();
  if (!row) throw new GoalError("That session was moved to another day, so mark it done there.");
  await audit({ ...auditActor(userId, actor), resourceType: "goal_session", resourceId: row.id, action: "goal_session.done", result: "success" });
  return { goal, row };
}

/** Undoes "done" or a postponement on a session. */
export async function undoSession(userId: string, ref: Required<SlotRef>, actor: GoalActor) {
  const [row] = await db
    .select()
    .from(schema.goalSessions)
    .where(and(eq(schema.goalSessions.userId, userId), eq(schema.goalSessions.goalId, ref.goalId), eq(schema.goalSessions.scheduledDate, ref.date), eq(schema.goalSessions.slotTime, ref.slotTime)));
  if (!row) throw new GoalError("Nothing to undo there.");
  await db.transaction(async (tx) => {
    if (row.status === "postponed" && row.movedToDate) {
      // Bring it back: drop the moved copy unless it was already done.
      await tx
        .delete(schema.goalSessions)
        .where(and(eq(schema.goalSessions.goalId, row.goalId), eq(schema.goalSessions.scheduledDate, row.movedToDate), eq(schema.goalSessions.slotTime, row.movedToTime ?? ""), eq(schema.goalSessions.status, "planned")));
      await tx.delete(schema.goalSessions).where(eq(schema.goalSessions.id, row.id));
    } else if (row.movedFromDate) {
      await tx.update(schema.goalSessions).set({ status: "planned", completedAt: null, value: null, unit: null, note: null }).where(eq(schema.goalSessions.id, row.id));
    } else {
      await tx.delete(schema.goalSessions).where(eq(schema.goalSessions.id, row.id));
    }
  });
  await audit({ ...auditActor(userId, actor), resourceType: "goal_session", resourceId: row.id, action: "goal_session.undone", result: "success" });
}

/** Moves one session to another day/time (just that once). A linked phone reminder call moves too. */
export async function postponeSession(userId: string, ref: Required<SlotRef>, to: { date: string; time: string | null }, actor: GoalActor) {
  const goal = await getOwnedGoal(userId, ref.goalId);
  if (!goal) throw new GoalError("That goal wasn't found.");
  const timezone = await userTimezone(userId);
  const today = localDate(new Date(), timezone);
  if (to.date < today || to.date > addDays(today, 14)) throw new GoalError("Choose a day between today and two weeks from now.");
  const toSlot = to.time ?? "";
  if (to.date === ref.date && toSlot === ref.slotTime) throw new GoalError("That's when it already is.");

  const [existing] = await db
    .select()
    .from(schema.goalSessions)
    .where(and(eq(schema.goalSessions.goalId, goal.id), eq(schema.goalSessions.scheduledDate, ref.date), eq(schema.goalSessions.slotTime, ref.slotTime)));
  const planned = plannedSlots(toPlan(goal), ref.date, ref.date).some((slot) => slot.slotTime === ref.slotTime);
  if (!existing && !planned) throw new GoalError("That session wasn't found.");
  if (existing && existing.status !== "planned") throw new GoalError(existing.status === "done" ? "That one's already done." : "That one was already moved.");
  const clash = await rowsFor(userId, [goal.id], to.date, to.date);
  if (clash.some((row) => row.slotTime === toSlot) || plannedSlots(toPlan(goal), to.date, to.date).some((slot) => slot.slotTime === toSlot)) {
    throw new GoalError("There's already a session for this goal then. Pick another time.");
  }

  await db.transaction(async (tx) => {
    if (existing?.movedFromDate) {
      // Already moved once: just move it again.
      await tx.update(schema.goalSessions).set({ scheduledDate: to.date, slotTime: toSlot }).where(eq(schema.goalSessions.id, existing.id));
      return;
    }
    const moved = { status: "postponed" as const, movedToDate: to.date, movedToTime: to.time, recordedByAgent: actor.type === "agent" ? actor.agent : null, sessionId: actor.type === "agent" ? actor.sessionId : null };
    if (existing) await tx.update(schema.goalSessions).set(moved).where(eq(schema.goalSessions.id, existing.id));
    else await tx.insert(schema.goalSessions).values({ userId, goalId: goal.id, scheduledDate: ref.date, slotTime: ref.slotTime, ...moved });
    await tx.insert(schema.goalSessions).values({
      userId,
      goalId: goal.id,
      scheduledDate: to.date,
      slotTime: toSlot,
      status: "planned",
      movedFromDate: ref.date,
      movedFromTime: ref.slotTime || null,
      recordedByAgent: moved.recordedByAgent,
      sessionId: moved.sessionId,
    });
  });

  await moveReminderCalls(goal.id, timezone, ref.date, to);
  await audit({ ...auditActor(userId, actor), resourceType: "goal", resourceId: goal.id, action: "goal_session.postponed", result: "success", metadata: { from: ref.date, to: to.date } });
  return { goal };
}

/** Cancels the linked reminder call for the original day and books a one-off call at the new time. */
async function moveReminderCalls(goalId: string, timezone: string, fromDate: string, to: { date: string; time: string | null }) {
  const reminders = await db
    .select()
    .from(schema.reminders)
    .where(and(eq(schema.reminders.goalId, goalId), eq(schema.reminders.status, "active"), eq(schema.reminders.channel, "phone")));
  for (const reminder of reminders) {
    const original = zonedTimeToUtc(fromDate, reminder.localTime, timezone);
    await db
      .update(schema.callJobs)
      .set({ status: "cancelled", lastError: "session postponed" })
      .where(and(eq(schema.callJobs.idempotencyKey, `${reminder.id}:${original.toISOString()}`), eq(schema.callJobs.status, "scheduled")));
    const due = zonedTimeToUtc(to.date, to.time ?? reminder.localTime, timezone);
    if (due.getTime() > Date.now()) {
      await db
        .insert(schema.callJobs)
        .values({ userId: reminder.userId, reminderId: reminder.id, kind: "reminder", dueAt: due, idempotencyKey: `${reminder.id}:moved:${due.toISOString()}` })
        .onConflictDoNothing({ target: schema.callJobs.idempotencyKey });
    }
    await scheduleNextJob(reminder.id);
  }
}
