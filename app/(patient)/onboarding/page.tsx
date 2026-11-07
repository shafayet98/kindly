import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Brand, Icon } from "@/components/kindly/parts";
import { requirePatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { goBack } from "./actions";
import { ONBOARDING_STEPS, type OnboardingStep } from "./steps-config";
import { GoalStep, LocationStep, NameStep, PrivacyStep } from "./steps";

export const metadata: Metadata = { title: "Get started" };

const STEP_NAMES: Record<OnboardingStep, string> = { name: "Your name", location: "Your location", privacy: "Privacy choices", goal: "First goal" };

export default async function OnboardingPage() {
  const user = await requirePatient();
  // Onboarding runs once. Finished (or fully skipped) users never see it again.
  if (user.onboardingCompletedAt) redirect("/dashboard");

  const step: OnboardingStep = ONBOARDING_STEPS.find((s) => s === user.onboardingStep) ?? "name";
  const index = ONBOARDING_STEPS.indexOf(step);
  const [[profile], consents] = await Promise.all([
    db.select({ nickname: schema.patientProfiles.nickname }).from(schema.patientProfiles).where(eq(schema.patientProfiles.userId, user.id)),
    getConsentState(user.id),
  ]);
  const state = (i: number) => (i < index ? "is-done" : i === index ? "is-current" : "");

  return (
    <div className="onb">
      <aside className="onb__side">
        <Brand href="/onboarding" />
        <nav aria-label="Setup steps">
          <ol className="onb__list">
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s} className={state(i)} aria-current={i === index ? "step" : undefined}>
                <span className="n">{i < index ? <Icon name="check" className="icon--sm" /> : i + 1}</span>
                {STEP_NAMES[s]}
              </li>
            ))}
          </ol>
        </nav>
        <div className="notice notice--info" style={{ marginTop: "auto", fontSize: 15 }}>
          <Icon name="settings" />
          <p>You can change any of this later in Settings.</p>
        </div>
      </aside>
      <main id="main" className="onb__main">
        <div className="onb__content">
          {index > 0 ? (
            <form action={goBack}>
              <input type="hidden" name="to" value={ONBOARDING_STEPS[index - 1]} />
              <button type="submit" className="btn btn--link" style={{ paddingLeft: 0 }}>
                <Icon name="arrow-left" className="icon--sm" />
                Back
              </button>
            </form>
          ) : (
            <span style={{ height: 44, display: "block" }} />
          )}
          <p className="label" style={{ marginTop: 16 }}>
            Step {index + 1} of {ONBOARDING_STEPS.length}
          </p>
          <ol className="steps-bar" aria-hidden="true">
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s} className={state(i)} />
            ))}
          </ol>
          <div style={{ marginTop: 40 }}>
            {step === "name" && <NameStep nickname={profile?.nickname ?? null} />}
            {step === "location" && <LocationStep />}
            {step === "privacy" && <PrivacyStep />}
            {step === "goal" && <GoalStep phoneCallsOn={consents.outbound_calls} />}
          </div>
        </div>
      </main>
    </div>
  );
}
