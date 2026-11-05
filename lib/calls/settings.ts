import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { setConsent } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { cancelScheduledJobs, rescheduleAllForUser } from "@/lib/scheduling/jobs";

export async function getCallSettings(userId: string) {
  const [row] = await db
    .select({
      phoneE164: schema.users.phoneE164,
      phoneConfirmedAt: schema.users.phoneConfirmedAt,
      timezone: schema.users.timezone,
      callsEnabled: schema.callPreferences.callsEnabled,
      pausedAt: schema.callPreferences.pausedAt,
      quietHoursStart: schema.callPreferences.quietHoursStart,
      quietHoursEnd: schema.callPreferences.quietHoursEnd,
      maxCallsPerDay: schema.callPreferences.maxCallsPerDay,
      maxRetries: schema.callPreferences.maxRetries,
      retryDelayMinutes: schema.callPreferences.retryDelayMinutes,
    })
    .from(schema.users)
    .leftJoin(schema.callPreferences, eq(schema.callPreferences.userId, schema.users.id))
    .where(eq(schema.users.id, userId));
  return row;
}

/** Turns phone calls on with an explicit consent record for the confirmed number. */
export async function enablePhoneCalls(userId: string, phoneE164: string) {
  await db.update(schema.users).set({ phoneE164, phoneConfirmedAt: new Date() }).where(eq(schema.users.id, userId));
  await db
    .insert(schema.callPreferences)
    .values({ userId, callsEnabled: true })
    .onConflictDoUpdate({ target: schema.callPreferences.userId, set: { callsEnabled: true, pausedAt: null } });
  await setConsent(userId, "outbound_calls", true, { phone: phoneE164 });
  await rescheduleAllForUser(userId);
}

/** Turns phone calls off entirely: revokes consent and cancels every pending call. */
export async function disablePhoneCalls(userId: string) {
  await db.update(schema.callPreferences).set({ callsEnabled: false }).where(eq(schema.callPreferences.userId, userId));
  await setConsent(userId, "outbound_calls", false);
  await cancelScheduledJobs(userId, "calls turned off");
}

/** Immediate, temporary stop. Consent stays; nothing dials until resumed (AC-11). */
export async function pauseCalls(userId: string) {
  await db.update(schema.callPreferences).set({ pausedAt: new Date() }).where(eq(schema.callPreferences.userId, userId));
  await cancelScheduledJobs(userId, "calls paused");
  await audit({ actorUserId: userId, actorType: "patient", resourceType: "call_preferences", resourceId: userId, action: "calls.paused", result: "success" });
}

export async function resumeCalls(userId: string) {
  await db.update(schema.callPreferences).set({ pausedAt: null }).where(eq(schema.callPreferences.userId, userId));
  await rescheduleAllForUser(userId);
  await audit({ actorUserId: userId, actorType: "patient", resourceType: "call_preferences", resourceId: userId, action: "calls.resumed", result: "success" });
}

export async function updateCallLimits(
  userId: string,
  limits: { quietHoursStart: string; quietHoursEnd: string; maxCallsPerDay: number; maxRetries: number; retryDelayMinutes: number },
) {
  await db.update(schema.callPreferences).set(limits).where(eq(schema.callPreferences.userId, userId));
  await audit({ actorUserId: userId, actorType: "patient", resourceType: "call_preferences", resourceId: userId, action: "calls.limits_updated", result: "success" });
}
