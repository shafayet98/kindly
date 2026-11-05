import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your progress" };

export default async function Page() {
  await requireOnboardedPatient();
  return <ComingSoon title="Your progress" description="See your goals, check-ins, setbacks and plan changes over time, with facts kept separate from guesses." />;
}
