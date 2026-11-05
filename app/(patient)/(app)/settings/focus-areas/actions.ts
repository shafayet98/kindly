"use server";

import { redirect } from "next/navigation";
import { requirePatient } from "@/lib/auth/session";
import { setFocusAreas } from "@/lib/preferences/store";

export async function updateFocusAreas(formData: FormData) {
  const user = await requirePatient();
  await setFocusAreas(user.id, formData.getAll("area"));
  redirect("/dashboard");
}
