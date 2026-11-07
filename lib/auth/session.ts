import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homePathFor, ONBOARDING } from "./routing";

export type CurrentUser = {
  id: string;
  authUserId: string;
  email: string | null;
  role: "patient" | "clinician";
  isApprovedClinician: boolean;
  displayName: string | null;
  timezone: string;
  countryCode: string | null;
  onboardingStep: string | null;
  onboardingCompletedAt: Date | null;
};

const isApprovedClinicianSql = sql<boolean>`exists (
  select 1 from ${schema.clinicianInvitations}
  where ${schema.clinicianInvitations.acceptedUserId} = ${schema.users.id}
    and ${schema.clinicianInvitations.status} = 'approved'
)`;

/** Loads the app user for a Supabase identity in a single query, or null if not provisioned yet. */
async function loadAppUser(authUserId: string) {
  const [row] = await db
    .select({
      id: schema.users.id,
      role: schema.users.role,
      displayName: schema.users.displayName,
      timezone: schema.users.timezone,
      countryCode: schema.users.countryCode,
      onboardingStep: schema.patientProfiles.onboardingStep,
      onboardingCompletedAt: schema.patientProfiles.onboardingCompletedAt,
      isApprovedClinician: isApprovedClinicianSql,
    })
    .from(schema.users)
    .leftJoin(schema.patientProfiles, eq(schema.patientProfiles.userId, schema.users.id))
    .where(eq(schema.users.authUserId, authUserId));
  if (!row) return null;
  return {
    ...row,
    // A clinician role only counts while an approved invitation backs it.
    isApprovedClinician: row.role === "clinician" && row.isApprovedClinician,
    onboardingStep: row.onboardingStep ?? null,
    onboardingCompletedAt: row.onboardingCompletedAt ?? null,
  };
}

/**
 * Creates the app user (always a patient) and profile rows for a Supabase identity whose email is
 * confirmed. Returns null for unconfirmed identities. Safe to call repeatedly; never changes a role.
 */
export async function ensureAppUser(authUser: Pick<AuthUser, "id" | "email_confirmed_at">) {
  const existing = await loadAppUser(authUser.id);
  if (existing) return existing;
  if (!authUser.email_confirmed_at) return null;

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.users)
      .values({ authUserId: authUser.id })
      .onConflictDoNothing({ target: schema.users.authUserId })
      .returning({ id: schema.users.id });
    if (!created) return; // a concurrent request provisioned it
    await tx.insert(schema.patientProfiles).values({ userId: created.id });
    await tx.insert(schema.callPreferences).values({ userId: created.id });
    await audit(
      { actorUserId: created.id, actorType: "system", resourceType: "user", resourceId: created.id, action: "account.provisioned", result: "success" },
      tx,
    );
  });
  return loadAppUser(authUser.id);
}

/** The signed-in, email-verified user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  // Verified locally against the project's signing keys (no network call once keys are cached).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  let user = await loadAppUser(claims.sub);
  if (!user) {
    // First request for this identity: confirm the email with Supabase before provisioning.
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return null;
    user = await ensureAppUser(authData.user);
    if (!user) return null;
  }

  return { ...user, authUserId: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Any signed-in patient, including one who has not finished onboarding. */
export async function requirePatient() {
  const user = await requireUser();
  if (user.role !== "patient") redirect(homePathFor(user));
  return user;
}

/** A patient who has finished (or skipped through) onboarding. */
export async function requireOnboardedPatient() {
  const user = await requirePatient();
  if (!user.onboardingCompletedAt) redirect(ONBOARDING);
  return user;
}

export async function requireApprovedClinician() {
  const user = await requireUser();
  if (user.role !== "clinician" || !user.isApprovedClinician) {
    await audit({
      actorUserId: user.id,
      actorType: user.role,
      resourceType: "clinician_portal",
      action: "clinician.access",
      result: "denied",
    });
    redirect("/access-denied");
  }
  return user;
}
