import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { eq } from "drizzle-orm";
import { requirePatient } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { getFocusAreas } from "@/lib/preferences/store";
import { goalSuggestions } from "@/lib/preferences/suggestions";
import { FocusAreasStep, GoalStep, PrivacyStep } from "./steps";

export const metadata: Metadata = { title: "Get started" };

const STEPS = ["focus_areas", "goal", "privacy"] as const;

export default async function OnboardingPage() {
  const user = await requirePatient();
  // Onboarding runs once. Finished (or fully skipped) users never see it again.
  if (user.onboardingCompletedAt) redirect("/dashboard");

  const step = STEPS.find((s) => s === user.onboardingStep) ?? "focus_areas";
  const [areas, [profile]] = await Promise.all([
    getFocusAreas(user.id),
    db.select({ nickname: schema.patientProfiles.nickname }).from(schema.patientProfiles).where(eq(schema.patientProfiles.userId, user.id)),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <Wordmark href="/onboarding" />
      <main className="mt-6 w-full max-w-2xl">
        <p className="mb-2 text-sm font-semibold text-muted">
          Step {STEPS.indexOf(step) + 1} of {STEPS.length}
        </p>
        {step === "focus_areas" && <FocusAreasStep selected={areas} nickname={profile?.nickname ?? null} />}
        {step === "goal" && <GoalStep suggestions={goalSuggestions(areas)} />}
        {step === "privacy" && <PrivacyStep />}
      </main>
    </div>
  );
}
