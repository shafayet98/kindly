import { and, eq, isNull } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";

export type ConsentPurpose = (typeof schema.consentPurpose.enumValues)[number];

export const CONSENT_TERMS_VERSION = "mvp-1";

/** Active (granted, not revoked) consents for the user, by purpose. */
export async function getConsentState(userId: string): Promise<Record<ConsentPurpose, boolean>> {
  const rows = await db
    .select({ purpose: schema.consents.purpose })
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, userId), eq(schema.consents.status, "granted"), isNull(schema.consents.revokedAt)));
  const active = new Set(rows.map((row) => row.purpose));
  return Object.fromEntries(schema.consentPurpose.enumValues.map((purpose) => [purpose, active.has(purpose)])) as Record<
    ConsentPurpose,
    boolean
  >;
}

/**
 * Grants or revokes one purpose. Each change is its own auditable record; revoking keeps history.
 * Returns the active consent id when granted.
 */
export async function setConsent(userId: string, purpose: ConsentPurpose, granted: boolean, scope: Record<string, unknown> = {}) {
  return db.transaction(async (tx) => {
    const [active] = await tx
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(and(eq(schema.consents.userId, userId), eq(schema.consents.purpose, purpose), eq(schema.consents.status, "granted"), isNull(schema.consents.revokedAt)))
      .limit(1);

    if (granted && active) return active.id;
    if (!granted && !active) return null;

    if (granted) {
      const [created] = await tx
        .insert(schema.consents)
        .values({ userId, purpose, scope, termsVersion: CONSENT_TERMS_VERSION })
        .returning({ id: schema.consents.id });
      await audit({ actorUserId: userId, actorType: "patient", resourceType: "consent", resourceId: created.id, action: `consent.granted.${purpose}`, result: "success" }, tx);
      return created.id;
    }

    await tx
      .update(schema.consents)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(eq(schema.consents.userId, userId), eq(schema.consents.purpose, purpose), eq(schema.consents.status, "granted")));
    await audit({ actorUserId: userId, actorType: "patient", resourceType: "consent", resourceId: active!.id, action: `consent.revoked.${purpose}`, result: "success" }, tx);
    return null;
  });
}
