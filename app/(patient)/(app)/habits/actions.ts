"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { setConsent } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { correctHabitEvent, HabitError, logHabitEvent } from "@/lib/habits/service";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/time";

export type HabitState = { status: "idle" | "error" | "success"; message?: string };

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/progress");
  revalidatePath("/dashboard");
}

export async function allowHealthData() {
  const user = await requireOnboardedPatient();
  await setConsent(user.id, "health_data_processing", true);
  refresh();
}

const optionalNumber = z.preprocess((value) => (value === "" || value === null ? null : value), z.coerce.number().min(0).max(100000).nullable());

export async function logCheckIn(_prev: HabitState, formData: FormData): Promise<HabitState> {
  const user = await requireOnboardedPatient();
  const parsed = z
    .object({
      kind: z.enum(["activity", "food", "smoking", "sleep", "mood", "other"]),
      description: z.string().trim().min(1, { error: "Describe it in your own words." }).max(300),
      value: optionalNumber,
      unit: z.enum(["minutes", "hours", "cigarettes", "steps", "km", "servings", ""]).transform((unit) => unit || null),
      daysAgo: z.coerce.number().int().min(0).max(6),
      goalId: z.union([z.uuid(), z.literal("")]).transform((id) => id || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { kind, description, value, unit, daysAgo, goalId } = parsed.data;
  const occurredAt = daysAgo === 0 ? new Date() : zonedTimeToUtc(addDays(localDate(new Date(), user.timezone), -daysAgo), "12:00", user.timezone);
  try {
    await logHabitEvent(user.id, { kind, description, value, unit: value === null ? null : unit, occurredAt, certainty: value === null ? "low" : "medium", goalId }, { type: "patient" });
  } catch (error) {
    if (error instanceof HabitError) return { status: "error", message: error.message };
    throw error;
  }
  refresh();
  return { status: "success", message: "Saved." };
}

export async function correctEntry(_prev: HabitState, formData: FormData): Promise<HabitState> {
  const user = await requireOnboardedPatient();
  const id = z.uuid().safeParse(formData.get("id"));
  const value = optionalNumber.safeParse(formData.get("value"));
  const description = z.string().trim().max(300).safeParse(formData.get("description"));
  if (!id.success || !value.success || !description.success) return { status: "error", message: "Please check the correction." };
  try {
    await correctHabitEvent(user.id, id.data, { value: value.data, description: description.data || null }, { type: "patient" });
  } catch (error) {
    if (error instanceof HabitError) return { status: "error", message: error.message };
    throw error;
  }
  refresh();
  return { status: "success", message: "Corrected. The original is kept in your history." };
}

export async function addGoal(_prev: HabitState, formData: FormData): Promise<HabitState> {
  const user = await requireOnboardedPatient();
  const parsed = z
    .object({
      title: z.string().trim().min(3, { error: "Give the goal a short name." }).max(80),
      type: z.enum(["activity", "nutrition", "smoking", "sleep", "wellbeing", "other"]),
      timesPerWeek: z.preprocess((value) => (value === "" ? null : value), z.coerce.number().int().min(1).max(14).nullable()),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the goal." };
  const [goal] = await db
    .insert(schema.goals)
    .values({ userId: user.id, title: parsed.data.title, type: parsed.data.type, target: parsed.data.timesPerWeek ? { timesPerWeek: parsed.data.timesPerWeek } : {} })
    .returning({ id: schema.goals.id });
  await audit({ actorUserId: user.id, actorType: "patient", resourceType: "goal", resourceId: goal.id, action: "goal.created", result: "success" });
  refresh();
  return { status: "success", message: "Goal added." };
}

export async function archiveGoal(formData: FormData) {
  const user = await requireOnboardedPatient();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db
    .update(schema.goals)
    .set({ status: "archived" })
    .where(and(eq(schema.goals.id, id.data), eq(schema.goals.userId, user.id)));
  await audit({ actorUserId: user.id, actorType: "patient", resourceType: "goal", resourceId: id.data, action: "goal.archived", result: "success" });
  refresh();
}
