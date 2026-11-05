import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Privacy & data" };

export default async function Page() {
  await requireOnboardedPatient();
  return <ComingSoon title="Privacy & data" description="Review your permissions, see what Kindly remembers, and export or delete your data." />;
}
