import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { nextOccurrence } from "./occurrences";

export const ON_DEMAND_CALLS_PER_HOUR = 3;

/**
 * Makes sure an active phone reminder has exactly one scheduled job: its next occurrence after
 * `after`. Safe to call repeatedly; the idempotency key prevents duplicates.
 */
export async function scheduleNextJob(reminderId: string, after = new Date()) {
  const [reminder] = await db
    .select({
      id: schema.reminders.id,
      userId: schema.reminders.userId,
      localTime: schema.reminders.localTime,
      daysOfWeek: schema.reminders.daysOfWeek,
      timezone: schema.reminders.timezone,
      channel: schema.reminders.channel,
      status: schema.reminders.status,
    })
    .from(schema.reminders)
    .where(eq(schema.reminders.id, reminderId));

  let due = reminder && reminder.status === "active" && reminder.channel === "phone" ? nextOccurrence(reminder, after) : null;
  // Skip occurrences that already had a job (finished, failed or skipped), so a finished
  // occurrence is never re-queued and the following one is scheduled instead.
  for (let guard = 0; due && reminder && guard < 8; guard++) {
    const [existing] = await db
      .select({ status: schema.callJobs.status })
      .from(schema.callJobs)
      .where(eq(schema.callJobs.idempotencyKey, `${reminderId}:${due.toISOString()}`));
    if (!existing || existing.status === "scheduled") break;
    due = nextOccurrence(reminder, due);
  }

  await db.transaction(async (tx) => {
    // Drop any other future job for this reminder (e.g. the old time after a reschedule).
    await tx
      .update(schema.callJobs)
      .set({ status: "cancelled", lastError: "superseded" })
      .where(
        and(
          eq(schema.callJobs.reminderId, reminderId),
          eq(schema.callJobs.status, "scheduled"),
          due ? ne(schema.callJobs.dueAt, due) : sql`true`,
        ),
      );
    if (!due || !reminder) return;
    await tx
      .insert(schema.callJobs)
      .values({ userId: reminder.userId, reminderId, kind: "reminder", dueAt: due, idempotencyKey: `${reminderId}:${due.toISOString()}` })
      .onConflictDoNothing({ target: schema.callJobs.idempotencyKey });
  });
  return due;
}

/** Cancels every not-yet-started job for a user (pause, opt-out, consent revoked). */
export async function cancelScheduledJobs(userId: string, reason: string) {
  await db
    .update(schema.callJobs)
    .set({ status: "cancelled", lastError: reason })
    .where(and(eq(schema.callJobs.userId, userId), eq(schema.callJobs.status, "scheduled")));
}

/** Re-creates next jobs for all of a user's active phone reminders (resume, opt back in). */
export async function rescheduleAllForUser(userId: string) {
  const rows = await db
    .select({ id: schema.reminders.id })
    .from(schema.reminders)
    .where(and(eq(schema.reminders.userId, userId), eq(schema.reminders.status, "active"), eq(schema.reminders.channel, "phone")));
  for (const row of rows) await scheduleNextJob(row.id);
}

/** Queues a "call me now" job. The phone server dials it within a few seconds. */
export async function queueOnDemandCall(userId: string) {
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.callJobs)
    .where(and(eq(schema.callJobs.userId, userId), eq(schema.callJobs.kind, "on_demand"), gt(schema.callJobs.createdAt, sql`now() - interval '1 hour'`)));
  if ((recent?.count ?? 0) >= ON_DEMAND_CALLS_PER_HOUR) return { ok: false as const, reason: "rate_limited" as const };

  const [active] = await db
    .select({ id: schema.callJobs.id })
    .from(schema.callJobs)
    .where(and(eq(schema.callJobs.userId, userId), inArray(schema.callJobs.status, ["scheduled", "dialing", "ringing", "in_progress"]), eq(schema.callJobs.kind, "on_demand")))
    .limit(1);
  if (active) return { ok: false as const, reason: "already_calling" as const };

  const now = new Date();
  const [job] = await db
    .insert(schema.callJobs)
    .values({ userId, kind: "on_demand", dueAt: now, idempotencyKey: `now:${userId}:${now.toISOString()}` })
    .returning({ id: schema.callJobs.id });
  return { ok: true as const, jobId: job.id };
}

/** Recent call activity for the schedule page. */
export async function recentCallJobs(userId: string, limit = 8) {
  return db
    .select({
      id: schema.callJobs.id,
      kind: schema.callJobs.kind,
      status: schema.callJobs.status,
      dueAt: schema.callJobs.dueAt,
      attempts: schema.callJobs.attempts,
      lastError: schema.callJobs.lastError,
      reminderTitle: schema.reminders.title,
      activeAgent: schema.callSessions.activeAgent,
      sessionState: schema.callSessions.state,
    })
    .from(schema.callJobs)
    .leftJoin(schema.reminders, eq(schema.reminders.id, schema.callJobs.reminderId))
    .leftJoin(schema.callSessions, and(eq(schema.callSessions.callJobId, schema.callJobs.id), isNotNull(schema.callSessions.callJobId)))
    .where(eq(schema.callJobs.userId, userId))
    .orderBy(sql`${schema.callJobs.dueAt} desc`)
    .limit(limit);
}
