import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type CallEligibility =
  | { ok: true; phoneE164: string; timezone: string }
  | { ok: false; reason: "no_phone" | "no_consent" | "calls_off" | "paused" };

/** Whether Kindly may place an outbound call to this user right now (consent and switches only). */
export async function checkCallEligibility(userId: string): Promise<CallEligibility> {
  const [row] = await db
    .select({
      phoneE164: schema.users.phoneE164,
      phoneConfirmedAt: schema.users.phoneConfirmedAt,
      timezone: schema.users.timezone,
      callsEnabled: schema.callPreferences.callsEnabled,
      pausedAt: schema.callPreferences.pausedAt,
      consentId: schema.consents.id,
    })
    .from(schema.users)
    .leftJoin(schema.callPreferences, eq(schema.callPreferences.userId, schema.users.id))
    .leftJoin(
      schema.consents,
      and(
        eq(schema.consents.userId, schema.users.id),
        eq(schema.consents.purpose, "outbound_calls"),
        eq(schema.consents.status, "granted"),
        isNull(schema.consents.revokedAt),
      ),
    )
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!row?.phoneE164 || !row.phoneConfirmedAt) return { ok: false, reason: "no_phone" };
  if (!row.consentId) return { ok: false, reason: "no_consent" };
  if (!row.callsEnabled) return { ok: false, reason: "calls_off" };
  if (row.pausedAt) return { ok: false, reason: "paused" };
  return { ok: true, phoneE164: row.phoneE164, timezone: row.timezone };
}
