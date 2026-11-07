"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { setConsent } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteWellbeingNote } from "@/lib/wellbeing/notes";

const TOGGLEABLE = z.enum(["health_data_processing", "browser_voice", "sensitive_wellbeing", "conversation_summaries"]);

export async function toggleConsent(formData: FormData) {
  const user = await requireOnboardedPatient();
  const purpose = TOGGLEABLE.safeParse(formData.get("purpose"));
  if (!purpose.success) return;
  await setConsent(user.id, purpose.data, formData.get("next") === "true");
  revalidatePath("/settings/privacy");
}

/** Whether summaries may include the part of a call spent with Sarah. Off unless chosen. */
export async function toggleSarahInSummaries(formData: FormData) {
  const user = await requireOnboardedPatient();
  const include = formData.get("next") === "true";
  const [profile] = await db.select({ preferences: schema.patientProfiles.preferences }).from(schema.patientProfiles).where(eq(schema.patientProfiles.userId, user.id));
  await db
    .update(schema.patientProfiles)
    .set({ preferences: { ...(profile?.preferences ?? {}), summariesIncludeSarah: include } })
    .where(eq(schema.patientProfiles.userId, user.id));
  await audit({ actorUserId: user.id, actorType: "patient", resourceType: "preferences", resourceId: user.id, action: `summaries.sarah_${include ? "included" : "excluded"}`, result: "success" });
  revalidatePath("/settings/privacy");
}

export async function removeNote(formData: FormData) {
  const user = await requireOnboardedPatient();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await deleteWellbeingNote(user.id, id.data);
  revalidatePath("/settings/privacy");
}

export type DeleteState = { message?: string };

/** Permanently deletes the account. All app data cascades from the auth identity. */
export async function deleteAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const user = await requireOnboardedPatient();
  if (formData.get("confirm") !== "DELETE") return { message: "Type DELETE to confirm." };
  await audit({ actorUserId: null, actorType: "patient", resourceType: "user", resourceId: user.id, action: "account.deleted", result: "success" });
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.authUserId);
  if (error) return { message: "We couldn't delete your account. Please try again." };
  redirect("/?deleted=1");
}
