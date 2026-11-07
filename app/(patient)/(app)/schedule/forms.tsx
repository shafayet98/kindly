"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/kindly/icon";
import { OptionCard } from "@/components/kindly/option-card";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { addReminder, callMeNow, editReminder, saveCallLimits, turnOnCalls, type ScheduleState } from "./actions";

const initial: ScheduleState = { status: "idle" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Result({ state }: { state: ScheduleState }) {
  if (!state.message) return null;
  return <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>;
}

function DayChips({ selected, idPrefix }: { selected: number[]; idPrefix: string }) {
  return (
    <fieldset className="fieldset">
      <legend>Days</legend>
      <div className="chips chips--days">
        {DAYS.map((day, index) => (
          <span key={day}>
            <input className="chip-input" type="checkbox" id={`${idPrefix}-${index}`} name="day" value={index} defaultChecked={selected.includes(index)} />
            <label className="chip" htmlFor={`${idPrefix}-${index}`}>
              {day}
            </label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

export function AddReminderForm({ phoneAllowed }: { phoneAllowed: boolean }) {
  const [state, action] = useActionState(addReminder, initial);
  return (
    <form action={action} className="stack-24" key={state.status === "success" ? state.message : "form"}>
      <Result state={state} />
      <div className="grid gap-5 md:grid-cols-[1fr_200px]">
        <div className="field">
          <label className="field__label" htmlFor="na-what">
            What for?
          </label>
          <input className="input" id="na-what" name="title" required maxLength={80} defaultValue={state.values?.title} placeholder="e.g. Evening walk" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="na-time">
            Time
          </label>
          <input className="input" id="na-time" name="time" type="time" required defaultValue={state.values?.time ?? "08:00"} />
        </div>
      </div>
      <DayChips selected={[1, 3, 5]} idPrefix="na-day" />
      <fieldset className="fieldset">
        <legend>How should we remind you?</legend>
        <div className="grid-2" style={{ gap: 12 }}>
          <OptionCard name="channel" value="in_app" radio defaultChecked title="In the app" desc="A reminder on your Home page." />
          {phoneAllowed ? (
            <OptionCard name="channel" value="phone" radio title="A phone call from Milo" desc="Milo rings your mobile at this time." />
          ) : (
            <div className="option" style={{ cursor: "not-allowed", opacity: 0.6 }} aria-disabled="true">
              <span className="option__box" />
              <span>
                <span className="option__title" style={{ display: "block" }}>
                  A phone call from Milo
                </span>
                <span className="option__desc" style={{ display: "block" }}>
                  Turn on phone calls first.
                </span>
              </span>
            </div>
          )}
        </div>
      </fieldset>
      <div>
        <SubmitButton>Add reminder</SubmitButton>
      </div>
    </form>
  );
}

export function EditReminderForm({ id, localTime, daysOfWeek }: { id: string; localTime: string; daysOfWeek: number[] }) {
  const [state, action] = useActionState(editReminder, initial);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="stack-24">
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <div className="field" style={{ maxWidth: 200 }}>
        <label className="field__label" htmlFor={`rt-${id}`}>
          New time
        </label>
        <input className="input" id={`rt-${id}`} name="time" type="time" required defaultValue={localTime} />
      </div>
      <DayChips selected={daysOfWeek} idPrefix={`rd-${id}`} />
      <div className="row">
        <SubmitButton size="sm">Save changes</SubmitButton>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            const details = formRef.current?.closest("details");
            if (details) details.open = false;
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TurnOnCallsForm({ phone }: { phone: string | null }) {
  const [state, action] = useActionState(turnOnCalls, initial);
  return (
    <form action={action} className="stack-24">
      <Result state={state} />
      <div className="field">
        <label className="field__label" htmlFor="mob">
          Your mobile number
        </label>
        <input className="input" id="mob" name="phone" type="tel" required autoComplete="tel" defaultValue={state.values?.phone ?? phone ?? ""} placeholder="0412 345 678" aria-describedby="mob-hint" />
        <p className="field__hint" id="mob-hint">
          Australian mobile, e.g. 0412 345 678
        </p>
      </div>
      <OptionCard
        name="agree"
        title="This is my number, and I agree to receive calls from Kindly's AI companions at it"
        desc="Only at reminder times you set, never during quiet hours. Audio isn't recorded. You can pause or turn calls off any time."
      />
      <div>
        <SubmitButton>Turn on phone calls</SubmitButton>
      </div>
    </form>
  );
}

export function CallLimitsForm(props: { quietHoursStart: string; quietHoursEnd: string; maxCallsPerDay: number; maxRetries: number; retryDelayMinutes: number }) {
  const [state, action] = useActionState(saveCallLimits, initial);
  return (
    <form action={action} className="stack-24">
      <Result state={state} />
      <div className="grid-2" style={{ gap: 16 }}>
        <div className="field">
          <label className="field__label" htmlFor="qs">
            Quiet hours start
          </label>
          <input className="input" id="qs" name="quietHoursStart" type="time" defaultValue={props.quietHoursStart} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="qe">
            Quiet hours end
          </label>
          <input className="input" id="qe" name="quietHoursEnd" type="time" defaultValue={props.quietHoursEnd} />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="mx">
          Most reminder calls per day
        </label>
        <select className="select" id="mx" name="maxCallsPerDay" defaultValue={props.maxCallsPerDay}>
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "None" : n}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2" style={{ gap: 16 }}>
        <div className="field">
          <label className="field__label" htmlFor="rtry">
            If I miss a call, try again
          </label>
          <select className="select" id="rtry" name="maxRetries" defaultValue={props.maxRetries}>
            <option value={0}>Don&apos;t try again</option>
            <option value={1}>Once</option>
            <option value={2}>Twice</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="wt">
            Wait before trying again
          </label>
          <select className="select" id="wt" name="retryDelayMinutes" defaultValue={props.retryDelayMinutes}>
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <SubmitButton variant="secondary" size="sm">
          Save call settings
        </SubmitButton>
      </div>
    </form>
  );
}

export function CallMeNowButton({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(callMeNow, initial);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <SubmitButton disabled={disabled}>
        <Icon name="phone" className="icon--sm" />
        Call me now
      </SubmitButton>
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
    <span className="status status--live" style={{ height: 28, fontSize: 13 }} role="status">
      <span className="speaking" aria-hidden="true" style={{ height: 12 }}>
        <span />
        <span />
        <span />
      </span>
      Live
    </span>
  ) : null;
}
