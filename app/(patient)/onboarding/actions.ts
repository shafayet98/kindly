"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requirePatient } from "@/lib/auth/session";
import { setConsent } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { getFocusAreas, setFocusAreas } from "@/lib/preferences/store";
import { goalSuggestions } from "@/lib/preferences/suggestions";

export type OnboardingStep = "focus_areas" | "goal" | "privacy";

async function setStep(userId: string, step: OnboardingStep) {
  await db.update(schema.patientProfiles).set({ onboardingStep: step }).where(eq(schema.patientProfiles.userId, userId));
}

const nickname = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value.replace(/[\p{C}<>]/gu, ""));

export async function saveFocusAreasStep(formData: FormData) {
  const user = await requirePatient();
  const skipped = formData.get("intent") === "skip";
  await setFocusAreas(user.id, skipped ? [] : formData.getAll("area"));
  const name = nickname.safeParse(formData.get("nickname") ?? "");
  if (name.success && name.data) {
    await db.update(schema.patientProfiles).set({ nickname: name.data }).where(eq(schema.patientProfiles.userId, user.id));
  }
  await setStep(user.id, "goal");
  redirect("/onboarding");
}

const customGoal = z.string().trim().min(3).max(120);

export async function saveGoalStep(formData: FormData) {
  const user = await requirePatient();
  if (formData.get("intent") !== "skip") {
    const choice = String(formData.get("goal") ?? "");
    const suggestions = goalSuggestions(await getFocusAreas(user.id));
    const suggested = suggestions.find((goal) => goal.title === choice);
    const custom = choice === "custom" ? customGoal.safeParse(formData.get("customGoal")) : null;

    if (suggested) {
      await db.insert(schema.goals).values({ userId: user.id, type: suggested.type, title: suggested.title, target: suggested.target });
    } else if (custom?.success) {
      await db.insert(schema.goals).values({ userId: user.id, type: "other", title: custom.data });
    }
  }
  await setStep(user.id, "privacy");
  redirect("/onboarding");
}

export async function finishOnboarding(formData: FormData) {
  const user = await requirePatient();
  // Only the boxes the person ticks are granted. Calls and clinician sharing are set up later.
  if (formData.get("health_data_processing") === "on") await setConsent(user.id, "health_data_processing", true);
  if (formData.get("browser_voice") === "on") await setConsent(user.id, "browser_voice", true);

  await db
    .update(schema.patientProfiles)
    .set({ onboardingStep: null, onboardingCompletedAt: new Date() })
    .where(eq(schema.patientProfiles.userId, user.id));
  await audit({ actorUserId: user.id, actorType: "patient", resourceType: "onboarding", resourceId: user.id, action: "onboarding.completed", result: "success" });
  redirect("/dashboard");
}

export async function goBack(formData: FormData) {
  const user = await requirePatient();
  const to = formData.get("to");
  if (to === "focus_areas" || to === "goal") await setStep(user.id, to);
  redirect("/onboarding");
}
