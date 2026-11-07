"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { disablePhoneCalls, enablePhoneCalls, pauseCalls, resumeCalls, updateCallLimits } from "@/lib/calls/settings";
import { createReminder, ReminderError, rescheduleReminder, setReminderStatus } from "@/lib/reminders/service";
import { queueOnDemandCall } from "@/lib/scheduling/jobs";
import { checkCallEligibility } from "@/lib/telephony/eligibility";
import { normalizePhone } from "@/lib/telephony/phone";

// `values` echoes what was submitted so a form keeps its input after an error.
export type ScheduleState = { status: "idle" | "error" | "success"; message?: string; values?: Record<string, string> };

function submitted(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, String(formData.get(key) ?? "")]));
}

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const days = z.array(z.coerce.number().int().min(0).max(6)).min(1, { error: "Pick at least one day." });
const uuid = z.uuid();

function readDays(formData: FormData) {
  return days.safeParse(formData.getAll("day"));
}

function done(message: string): ScheduleState {
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { status: "success", message };
}

export async function addReminder(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const user = await requireOnboardedPatient();
  const title = z.string().trim().min(2).max(80).safeParse(formData.get("title"));
  const localTime = time.safeParse(formData.get("time"));
  const selectedDays = readDays(formData);
  const channel = z.enum(["in_app", "phone"]).safeParse(formData.get("channel"));
  const values = submitted(formData, ["title", "time"]);
  if (!title.success) return { status: "error", message: "Give the reminder a short name.", values };
  if (!localTime.success) return { status: "error", message: "Choose a time.", values };
  if (!selectedDays.success) return { status: "error", message: "Pick at least one day.", values };
  if (!channel.success) return { status: "error", message: "Choose how to be reminded.", values };
  try {
    await createReminder(user.id, { title: title.data, localTime: localTime.data, daysOfWeek: selectedDays.data, channel: channel.data }, { type: "patient" });
  } catch (error) {
    if (error instanceof ReminderError) return { status: "error", message: error.message, values };
    throw error;
  }
  return done("Reminder added.");
}

export async function editReminder(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const user = await requireOnboardedPatient();
  const id = uuid.safeParse(formData.get("id"));
  const localTime = time.safeParse(formData.get("time"));
  const selectedDays = readDays(formData);
  if (!id.success || !localTime.success || !selectedDays.success) return { status: "error", message: "Choose a time and at least one day." };
  try {
    const { before, after } = await rescheduleReminder(user.id, id.data, { localTime: localTime.data, daysOfWeek: selectedDays.data }, { type: "patient" });
    return done(before.localTime === after.localTime ? "Reminder updated." : `Moved from ${before.localTime} to ${after.localTime}.`);
  } catch (error) {
    if (error instanceof ReminderError) return { status: "error", message: error.message };
    throw error;
  }
}

export async function changeReminderStatus(formData: FormData) {
  const user = await requireOnboardedPatient();
  const id = uuid.safeParse(formData.get("id"));
  const status = z.enum(["active", "paused", "cancelled"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return;
  try {
    await setReminderStatus(user.id, id.data, status.data, { type: "patient" });
  } catch (error) {
    if (!(error instanceof ReminderError)) throw error;
  }
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

export async function turnOnCalls(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const user = await requireOnboardedPatient();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const values = submitted(formData, ["phone"]);
  if (!phone) return { status: "error", message: "Enter a valid mobile number, like 0412 345 678.", values };
  if (formData.get("agree") !== "on") return { status: "error", message: "Please tick the box to confirm this is your number and that Kindly may call it.", values };
  await enablePhoneCalls(user.id, phone);
  return done("Phone calls are on.");
}

export async function turnOffCalls() {
  const user = await requireOnboardedPatient();
  await disablePhoneCalls(user.id);
  revalidatePath("/schedule");
}

export async function togglePause(formData: FormData) {
  const user = await requireOnboardedPatient();
  if (formData.get("pause") === "true") await pauseCalls(user.id);
  else await resumeCalls(user.id);
  revalidatePath("/schedule");
}

export async function saveCallLimits(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const user = await requireOnboardedPatient();
  const parsed = z
    .object({
      quietHoursStart: time,
      quietHoursEnd: time,
      maxCallsPerDay: z.coerce.number().int().min(0).max(3),
      maxRetries: z.coerce.number().int().min(0).max(2),
      retryDelayMinutes: z.coerce.number().int().min(5).max(60),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Please check the call settings." };
  await updateCallLimits(user.id, parsed.data);
  return done("Call settings saved.");
}

export async function callMeNow(): Promise<ScheduleState> {
  const user = await requireOnboardedPatient();
  const eligibility = await checkCallEligibility(user.id);
  if (!eligibility.ok) {
    return { status: "error", message: eligibility.reason === "paused" ? "Calls are paused. Resume them first." : "Turn on phone calls first." };
  }
  const queued = await queueOnDemandCall(user.id);
  if (!queued.ok) {
    return {
      status: "error",
      message: queued.reason === "already_calling" ? "A call is already on its way." : "You've asked for a few calls already. Please try again later.",
    };
  }
  return done("Calling you now. Your phone should ring within about 10 seconds.");
}
