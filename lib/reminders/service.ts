import { and, eq } from "drizzle-orm";
import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { scheduleNextJob } from "@/lib/scheduling/jobs";

// Milo's reminder service. Every function is scoped to the given userId, which callers take from
// the authenticated session or a server-issued call token.

export type Actor = { type: "patient" } | { type: "agent"; agent: AgentKey };
export type ReminderFields = { title: string; localTime: string; daysOfWeek: number[]; channel: "in_app" | "phone" };

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

export async function createReminder(userId: string, fields: ReminderFields, actor: Actor) {
  await assertPhoneAllowed(userId, fields.channel);
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
  const [after] = await db
    .update(schema.reminders)
    .set({ localTime: change.localTime ?? before.localTime, daysOfWeek: change.daysOfWeek ?? before.daysOfWeek })
    .where(and(eq(schema.reminders.id, reminderId), eq(schema.reminders.userId, userId)))
    .returning();
  const nextDue = await scheduleNextJob(reminderId);
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
