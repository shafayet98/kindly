"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { correctEntry, logCheckIn, type HabitState } from "./actions";

const initial: HabitState = { status: "idle" };

function Result({ state }: { state: HabitState }) {
  if (!state.message) return null;
  return <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>;
}

export function LogCheckInForm() {
  const [state, action] = useActionState(logCheckIn, initial);
  return (
    <form action={action} className="card card--sunken stack-24">
      <Result state={state} />
      <div className="grid items-end gap-4 md:grid-cols-[200px_1fr_180px]">
        <div className="field">
          <label className="field__label" htmlFor="ci-kind">
            What kind?
          </label>
          <select className="select" id="ci-kind" name="kind" defaultValue="activity">
            <option value="activity">Activity</option>
            <option value="food">Food & drink</option>
            <option value="sleep">Sleep</option>
            <option value="smoking">Smoking</option>
            <option value="mood">How I&apos;m feeling</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ci-desc">
            In your own words
          </label>
          <input className="input" id="ci-desc" name="description" required maxLength={300} placeholder="e.g. Slept about 7 hours" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ci-day">
            When?
          </label>
          <select className="select" id="ci-day" name="daysAgo" defaultValue="0">
            <option value="0">Today</option>
            <option value="1">Yesterday</option>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} days ago
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid items-end gap-4 md:grid-cols-[160px_180px_auto]">
        <div className="field">
          <label className="field__label" htmlFor="ci-value">
            Amount <span className="field__opt">(optional)</span>
          </label>
          <input className="input" id="ci-value" name="value" type="number" min={0} step="any" inputMode="decimal" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ci-unit">
            Unit
          </label>
          <select className="select" id="ci-unit" name="unit" defaultValue="">
            <option value="">—</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="cigarettes">cigarettes</option>
            <option value="steps">steps</option>
            <option value="km">km</option>
            <option value="servings">servings</option>
          </select>
        </div>
        <div>
          <SubmitButton variant="secondary">Save check-in</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function CorrectEntryForm({ id, value, description }: { id: string; value: string | null; description: string | null }) {
  const [state, action] = useActionState(correctEntry, initial);
  return (
    <form action={action} className="move-panel stack">
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-value`}>
            Correct amount
          </label>
          <input className="input" id={`${id}-value`} name="value" type="number" min={0} step="any" defaultValue={value ?? ""} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-desc`}>
            Correct description
          </label>
          <input className="input" id={`${id}-desc`} name="description" maxLength={300} defaultValue={description ?? ""} />
        </div>
      </div>
      <div>
        <SubmitButton variant="secondary" size="sm">
          Save correction
        </SubmitButton>
      </div>
    </form>
  );
}
