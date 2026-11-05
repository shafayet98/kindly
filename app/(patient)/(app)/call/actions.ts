"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { setConsent } from "@/lib/consent/store";

export async function allowBrowserVoice() {
  const user = await requireOnboardedPatient();
  await setConsent(user.id, "browser_voice", true);
  revalidatePath("/call");
}
