"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { addReminder, callMeNow, editReminder, saveCallLimits, turnOnCalls, type ScheduleState } from "./actions";

const initial: ScheduleState = { status: "idle" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Result({ state }: { state: ScheduleState }) {
  if (!state.message) return null;
  return <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>;
}

function DayPicker({ selected, idPrefix }: { selected: number[]; idPrefix: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="font-semibold">Days</legend>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day, index) => (
          <label
            key={day}
            htmlFor={`${idPrefix}-${index}`}
            className="cursor-pointer rounded-full border border-border px-3 py-1.5 has-checked:border-primary has-checked:bg-primary-soft has-checked:font-bold"
          >
            <input id={`${idPrefix}-${index}`} type="checkbox" name="day" value={index} defaultChecked={selected.includes(index)} className="sr-only" />
            {day}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AddReminderForm({ phoneAllowed }: { phoneAllowed: boolean }) {
  const [state, action] = useActionState(addReminder, initial);
  return (
    <form action={action} className="flex flex-col gap-4" key={state.status === "success" ? state.message : "form"}>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 font-semibold">
          What for?
          <input name="title" required maxLength={80} defaultValue={state.values?.title} placeholder="e.g. Evening walk" className="rounded-xl border border-border bg-surface px-4 py-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Time
          <input name="time" type="time" required defaultValue={state.values?.time ?? "08:00"} className="rounded-xl border border-border bg-surface px-4 py-3 font-normal" />
        </label>
      </div>
      <DayPicker selected={[1, 3, 5]} idPrefix="new-day" />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="font-semibold">How should we remind you?</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="channel" value="in_app" defaultChecked className="h-4 w-4 accent-primary" /> In the app
        </label>
        <label className={`flex items-center gap-2 ${phoneAllowed ? "" : "text-muted"}`}>
          <input type="radio" name="channel" value="phone" disabled={!phoneAllowed} className="h-4 w-4 accent-primary" /> A phone call from Milo
          {!phoneAllowed && <span className="text-sm">(turn on phone calls below first)</span>}
        </label>
      </fieldset>
      <SubmitButton className="self-start">Add reminder</SubmitButton>
    </form>
  );
}

export function EditReminderForm({ id, localTime, daysOfWeek }: { id: string; localTime: string; daysOfWeek: number[] }) {
  const [state, action] = useActionState(editReminder, initial);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-2xl bg-background p-4">
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <label className="flex flex-col gap-1.5 font-semibold sm:max-w-xs">
        New time
        <input name="time" type="time" required defaultValue={localTime} className="rounded-xl border border-border bg-surface px-4 py-2 font-normal" />
      </label>
      <DayPicker selected={daysOfWeek} idPrefix={`edit-${id}`} />
      <SubmitButton variant="secondary" className="self-start">
        Save changes
      </SubmitButton>
    </form>
  );
}

export function TurnOnCallsForm({ phone }: { phone: string | null }) {
  const [state, action] = useActionState(turnOnCalls, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Result state={state} />
      <label className="flex flex-col gap-1.5 font-semibold sm:max-w-xs">
        Your mobile number
        <input name="phone" type="tel" required autoComplete="tel" defaultValue={state.values?.phone ?? phone ?? ""} placeholder="0412 345 678" className="rounded-xl border border-border bg-surface px-4 py-3 font-normal" />
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="agree" className="mt-1 h-5 w-5 shrink-0 accent-primary" />
        <span>
          This is my number, and Kindly may call it for the reminders I choose, outside my quiet hours. I can pause or turn
          off calls at any time.
        </span>
      </label>
      <SubmitButton className="self-start">Turn on phone calls</SubmitButton>
    </form>
  );
}

export function CallLimitsForm(props: { quietHoursStart: string; quietHoursEnd: string; maxCallsPerDay: number; maxRetries: number; retryDelayMinutes: number }) {
  const [state, action] = useActionState(saveCallLimits, initial);
  const field = "rounded-xl border border-border bg-surface px-3 py-2 font-normal";
  return (
    <form action={action} className="flex flex-col gap-4">
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 font-semibold">
          Quiet hours start
          <input name="quietHoursStart" type="time" defaultValue={props.quietHoursStart} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Quiet hours end
          <input name="quietHoursEnd" type="time" defaultValue={props.quietHoursEnd} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Most reminder calls per day
          <select name="maxCallsPerDay" defaultValue={props.maxCallsPerDay} className={field}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "None" : n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          If I miss a call, try again
          <select name="maxRetries" defaultValue={props.maxRetries} className={field}>
            <option value={0}>Don&apos;t try again</option>
            <option value={1}>Once</option>
            <option value={2}>Twice</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Wait before trying again
          <select name="retryDelayMinutes" defaultValue={props.retryDelayMinutes} className={field}>
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <SubmitButton variant="secondary" className="self-start">
        Save call settings
      </SubmitButton>
    </form>
  );
}

export function CallMeNowButton({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(callMeNow, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton disabled={disabled}>Call me now</SubmitButton>
      <Result state={state} />
    </form>
  );
}

/** Refreshes server data every few seconds while a call is in flight. */
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);
  return active ? (
    <p className="text-sm text-muted" role="status">
      Updating live…
    </p>
  ) : null;
}

