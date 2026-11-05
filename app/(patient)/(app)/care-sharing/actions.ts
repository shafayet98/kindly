"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { createReport, REPORT_SCOPES, ReportError, revokeShare, shareReport, type ReportScope } from "@/lib/reports/service";

export type CareState = { status: "idle" | "error"; message?: string };

export async function draftReport(_prev: CareState, formData: FormData): Promise<CareState> {
  const user = await requireOnboardedPatient();
  const weeks = z.coerce.number().int().refine((n) => n === 2 || n === 4).safeParse(formData.get("weeks"));
  const scopes = formData.getAll("scope").filter((scope): scope is ReportScope => typeof scope === "string" && scope in REPORT_SCOPES);
  if (!weeks.success) return { status: "error", message: "Choose a period." };
  let reportId: string;
  try {
    reportId = await createReport(user.id, user.timezone, weeks.data, scopes);
  } catch (error) {
    if (error instanceof ReportError) return { status: "error", message: error.message };
    throw error;
  }
  redirect(`/care-sharing/${reportId}`);
}

export async function share(_prev: CareState, formData: FormData): Promise<CareState> {
  const user = await requireOnboardedPatient();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  const clinicianId = z.uuid().safeParse(formData.get("clinicianId"));
  if (!reportId.success || !clinicianId.success) return { status: "error", message: "Choose who to share with." };
  if (formData.get("agree") !== "on") return { status: "error", message: "Please confirm you want to share this report." };
  try {
    await shareReport(user.id, reportId.data, clinicianId.data);
  } catch (error) {
    if (error instanceof ReportError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath(`/care-sharing/${reportId.data}`);
  revalidatePath("/care-sharing");
  return { status: "idle" };
}

export async function revoke(formData: FormData) {
  const user = await requireOnboardedPatient();
  const shareId = z.uuid().safeParse(formData.get("shareId"));
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!shareId.success || !reportId.success) return;
  await revokeShare(user.id, shareId.data);
  revalidatePath(`/care-sharing/${reportId.data}`);
  revalidatePath("/care-sharing");
}
