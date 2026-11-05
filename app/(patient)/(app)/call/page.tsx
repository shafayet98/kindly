import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Talk now" };

export default async function Page() {
  await requireOnboardedPatient();
  return <ComingSoon title="Talk now" description="Talk with Natalie, Milo or Sarah right here in your browser, and switch between them without hanging up." />;
}
