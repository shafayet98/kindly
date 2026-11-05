import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Goals & habits" };

export default async function Page() {
  await requireOnboardedPatient();
  return <ComingSoon title="Goals & habits" description="Add goals, log check-ins and correct anything that was recorded wrong." />;
}
