"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requirePatient } from "@/lib/auth/session";
import { setConsent } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";

import type { OnboardingStep } from "./steps-config";

async function setStep(userId: string, step: OnboardingStep) {
  await db.update(schema.patientProfiles).set({ onboardingStep: step }).where(eq(schema.patientProfiles.userId, userId));
}

const nickname = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value.replace(/[\p{C}<>]/gu, ""));

export async function saveName(formData: FormData) {
  const user = await requirePatient();
  const name = nickname.safeParse(formData.get("nickname") ?? "");
  if (name.success && name.data) {
    await db.update(schema.patientProfiles).set({ nickname: name.data }).where(eq(schema.patientProfiles.userId, user.id));
  }
  await setStep(user.id, "location");
  redirect("/onboarding");
}

/** Called after the location step saved a timezone. */
export async function locationDone() {
  const user = await requirePatient();
  await setStep(user.id, "privacy");
  redirect("/onboarding");
}

export async function savePrivacy(formData: FormData) {
  const user = await requirePatient();
  // Only what's ticked is granted. Calls and clinician sharing are set up separately, later.
  for (const purpose of ["health_data_processing", "browser_voice", "conversation_summaries"] as const) {
    if (formData.get(purpose) === "on") await setConsent(user.id, purpose, true);
  }
  await setStep(user.id, "goal");
  redirect("/onboarding");
}

export async function finishOnboarding() {
  const user = await requirePatient();
  await db
    .update(schema.patientProfiles)
    .set({ onboardingStep: null, onboardingCompletedAt: new Date() })
    .where(eq(schema.patientProfiles.userId, user.id));
  await audit({ actorUserId: user.id, actorType: "patient", resourceType: "onboarding", resourceId: user.id, action: "onboarding.completed", result: "success" });
  redirect("/dashboard");
}

export async function goBack(formData: FormData) {
  const user = await requirePatient();
  const to = z.enum(["name", "location", "privacy"]).safeParse(formData.get("to"));
  if (to.success) await setStep(user.id, to.data);
  redirect("/onboarding");
}
