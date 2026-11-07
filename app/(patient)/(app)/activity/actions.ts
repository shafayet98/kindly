"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { deleteSummary } from "@/lib/conversations/summary";

export async function removeSummary(formData: FormData) {
  const user = await requireOnboardedPatient();
  const sessionId = z.uuid().safeParse(formData.get("sessionId"));
  if (!sessionId.success) return;
  await deleteSummary(user.id, sessionId.data);
  revalidatePath("/activity");
}
