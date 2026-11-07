import { and, eq } from "drizzle-orm";
import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { scheduleNextJob } from "@/lib/scheduling/jobs";
import { getOwnedGoal, updateGoal } from "@/lib/goals/service";
import { hasFixedSessions } from "@/lib/goals/schedule";

// Milo's reminder service. Every function is scoped to the given userId, which callers take from
// the authenticated session or a server-issued call token.

export type Actor = { type: "patient" } | { type: "agent"; agent: AgentKey; sessionId?: string | null };
export type ReminderFields = { title: string; localTime: string; daysOfWeek: number[]; channel: "in_app" | "phone"; goalId?: string | null };

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** A goal whose schedule a linked reminder follows: fixed sessions at a single time. */
async function followedGoal(userId: string, goalId: string | null | undefined) {
  if (!goalId) return null;
  const goal = await getOwnedGoal(userId, goalId);
  return goal && goal.status === "active" && !goal.endsOn && hasFixedSessions(goal) && goal.times.length <= 1 ? goal : null;
}

function goalActor(actor: Actor) {
  return actor.type === "patient" ? actor : { type: "agent" as const, agent: actor.agent, sessionId: actor.sessionId ?? null };
}

export class ReminderError extends Error {}

function actorAudit(userId: string, actor: Actor) {
  return actor.type === "patient"
    ? { actorUserId: userId, actorType: "patient" as const }
    : { actorUserId: userId, actorType: "agent" as const, actorLabel: actor.agent };
}

export async function getOwnedReminder(userId: string, reminderId: string) {
  const [reminder] = await db
    .select()
    .from(schema.reminders)
    .where(and(eq(schema.reminders.id, reminderId), eq(schema.reminders.userId, userId)));
  return reminder ?? null;
}

async function assertPhoneAllowed(userId: string, channel: ReminderFields["channel"]) {
  if (channel !== "phone") return;
  const consents = await getConsentState(userId);
  if (!consents.outbound_calls) throw new ReminderError("Phone reminders need phone calls turned on first, in Reminders & calls.");
}

export function describeReminder(reminder: { title: string; localTime: string; daysOfWeek: number[]; channel: string }) {
  return `“${reminder.title}” at ${formatTime12h(reminder.localTime)}, ${formatDays(reminder.daysOfWeek).toLowerCase()}, by ${reminder.channel === "phone" ? "phone call" : "in-app reminder"}`;
}

export async function createReminder(userId: string, input: ReminderFields, actor: Actor) {
  await assertPhoneAllowed(userId, input.channel);
  let fields = input;
  if (input.goalId) {
    const owned = await getOwnedGoal(userId, input.goalId);
    if (!owned || owned.status !== "active" || owned.endsOn) throw new ReminderError("That goal wasn't found.");
    const goal = await followedGoal(userId, input.goalId);
    // A reminder for a goal with a set schedule rings at the goal's time on the goal's days.
    if (goal) fields = { ...input, localTime: goal.times[0] ?? input.localTime, daysOfWeek: goal.daysOfWeek?.length ? goal.daysOfWeek : ALL_DAYS };
  }
  const [user] = await db.select({ timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.id, userId));
  const [reminder] = await db
    .insert(schema.reminders)
    .values({ userId, ...fields, timezone: user.timezone })
    .returning();
  const nextDue = await scheduleNextJob(reminder.id);
  await audit({ ...actorAudit(userId, actor), resourceType: "reminder", resourceId: reminder.id, action: "reminder.created", result: "success" });
  return { reminder, nextDue };
}

export async function rescheduleReminder(userId: string, reminderId: string, change: { localTime?: string; daysOfWeek?: number[] }, actor: Actor) {
  const before = await getOwnedReminder(userId, reminderId);
  if (!before || before.status === "cancelled") throw new ReminderError("That reminder wasn't found.");
  const localTime = change.localTime ?? before.localTime;
  const daysOfWeek = change.daysOfWeek ?? before.daysOfWeek;

  // Moving the reminder for a goal moves the goal too ("move my walk to 5 PM"), so the calendar
  // and the call always agree. The goal change carries the reminder with it.
  const goal = await followedGoal(userId, before.goalId);
  const goalDays = goal?.cadence === "daily" && daysOfWeek.length === 7 ? null : daysOfWeek;
  const goalChanged = goal && (goal.times[0] !== localTime || JSON.stringify(goal.daysOfWeek ?? ALL_DAYS) !== JSON.stringify(daysOfWeek));

  let after: typeof before;
  let nextDue: Date | null;
  if (goal && goalChanged) {
    // The goal change already moved this reminder and its call; just read the result.
    await updateGoal(userId, goal.id, { times: [localTime], daysOfWeek: goalDays }, goalActor(actor));
    after = (await getOwnedReminder(userId, reminderId))!;
    const [job] = await db
      .select({ dueAt: schema.callJobs.dueAt })
      .from(schema.callJobs)
      .where(and(eq(schema.callJobs.reminderId, reminderId), eq(schema.callJobs.status, "scheduled")))
      .orderBy(schema.callJobs.dueAt)
      .limit(1);
    nextDue = job?.dueAt ?? null;
  } else {
    [after] = await db
      .update(schema.reminders)
      .set({ localTime, daysOfWeek })
      .where(and(eq(schema.reminders.id, reminderId), eq(schema.reminders.userId, userId)))
      .returning();
    nextDue = await scheduleNextJob(reminderId);
  }
  await audit({
    ...actorAudit(userId, actor),
    resourceType: "reminder",
    resourceId: reminderId,
    action: "reminder.rescheduled",
    result: "success",
    metadata: { from: before.localTime, to: after.localTime },
  });
  return { before, after, nextDue };
}

export async function setReminderStatus(userId: string, reminderId: string, status: "active" | "paused" | "cancelled", actor: Actor) {
  const before = await getOwnedReminder(userId, reminderId);
  if (!before || before.status === "cancelled") throw new ReminderError("That reminder wasn't found.");
  const [after] = await db
    .update(schema.reminders)
    .set({ status })
    .where(and(eq(schema.reminders.id, reminderId), eq(schema.reminders.userId, userId)))
    .returning();
  const nextDue = await scheduleNextJob(reminderId);
  await audit({ ...actorAudit(userId, actor), resourceType: "reminder", resourceId: reminderId, action: `reminder.${status}`, result: "success" });
  return { before, after, nextDue };
}
