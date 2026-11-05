import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Care sharing" };

export default async function Page() {
  await requireOnboardedPatient();
  return <ComingSoon title="Care sharing" description="Preview a summary for your clinician and choose exactly what to share, or revoke access." />;
}
