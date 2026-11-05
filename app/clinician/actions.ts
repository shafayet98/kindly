"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApprovedClinician } from "@/lib/auth/session";
import { markReviewed } from "@/lib/reports/service";

export async function markReportReviewed(formData: FormData) {
  const clinician = await requireApprovedClinician();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) return;
  await markReviewed(clinician.id, reportId.data);
  revalidatePath(`/clinician/reports/${reportId.data}`);
  revalidatePath("/clinician/tasks");
}
