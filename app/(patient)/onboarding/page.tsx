import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Wordmark } from "@/components/brand";
import { requirePatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { ONBOARDING_STEPS, type OnboardingStep } from "./steps-config";
import { GoalStep, LocationStep, NameStep, PrivacyStep } from "./steps";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await requirePatient();
  // Onboarding runs once. Finished (or fully skipped) users never see it again.
  if (user.onboardingCompletedAt) redirect("/dashboard");

  const step: OnboardingStep = ONBOARDING_STEPS.find((s) => s === user.onboardingStep) ?? "name";
  const [[profile], consents] = await Promise.all([
    db.select({ nickname: schema.patientProfiles.nickname }).from(schema.patientProfiles).where(eq(schema.patientProfiles.userId, user.id)),
    getConsentState(user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <Wordmark href="/onboarding" />
      <main className="mt-6 w-full max-w-2xl">
        <p className="mb-2 text-sm font-semibold text-muted">
          Step {ONBOARDING_STEPS.indexOf(step) + 1} of {ONBOARDING_STEPS.length}
        </p>
        {step === "name" && <NameStep nickname={profile?.nickname ?? null} />}
        {step === "location" && <LocationStep />}
        {step === "privacy" && <PrivacyStep />}
        {step === "goal" && <GoalStep phoneCallsOn={consents.outbound_calls} />}
      </main>
    </div>
  );
}
