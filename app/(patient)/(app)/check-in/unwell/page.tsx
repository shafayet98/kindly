import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { SAFETY_CONTACTS } from "@/lib/safety/contacts";

export const metadata: Metadata = { title: "Feeling unwell" };

// Available to everyone, whether or not they chose this focus area. Non-diagnostic by design.
export default async function FeelingUnwellPage() {
  await requireOnboardedPatient();
  const { emergency, healthAdvice } = SAFETY_CONTACTS;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-bold">Sorry you&apos;re not feeling well</h1>

      <div role="alert" className="rounded-2xl border-2 border-danger/40 bg-danger-soft p-5">
        <p className="font-bold text-danger">If this could be an emergency, call {emergency.number} now.</p>
        <p className="mt-1">
          For example: chest pain, trouble breathing, signs of a stroke, severe bleeding, or thoughts of harming yourself.
          Don&apos;t wait to talk to Kindly.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="font-bold">What Kindly can and can&apos;t do</p>
        <ul className="mt-2 list-disc pl-5">
          <li>Natalie can listen while you describe how you feel, in your own words.</li>
          <li>If you want, she can write it down so you can share it with a doctor or nurse.</li>
          <li>Kindly can&apos;t diagnose, rule out an emergency, or tell you an illness is harmless.</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/call?agent=natalie&topic=unwell">Talk to Natalie</ButtonLink>
        <ButtonLink href="/dashboard" variant="secondary">
          Back to home
        </ButtonLink>
      </div>

      <p className="text-muted">
        For medical advice from a registered nurse any time, call {healthAdvice.label.split(" (")[0]} on {healthAdvice.number}, or
        contact your GP.
      </p>
    </div>
  );
}
