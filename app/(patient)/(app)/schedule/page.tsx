import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Reminders & calls" };

export default async function Page() {
  await requireOnboardedPatient();
  return <ComingSoon title="Reminders & calls" description="Create, move and pause reminders, choose when Kindly may call your phone, and set quiet hours." />;
}
