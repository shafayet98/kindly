"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { addGoal, correctEntry, logCheckIn, type HabitState } from "./actions";

const initial: HabitState = { status: "idle" };
const field = "rounded-xl border border-border bg-surface px-3 py-2 font-normal";

function Result({ state }: { state: HabitState }) {
  if (!state.message) return null;
  return <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>;
}

export function LogCheckInForm({ goals }: { goals: { id: string; title: string }[] }) {
  const [state, action] = useActionState(logCheckIn, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 font-semibold">
          What kind?
          <select name="kind" className={field} defaultValue="activity">
            <option value="activity">Activity</option>
            <option value="food">Food</option>
            <option value="sleep">Sleep</option>
            <option value="smoking">Smoking</option>
            <option value="mood">How I&apos;m feeling</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          When?
          <select name="daysAgo" className={field} defaultValue="0">
            <option value="0">Today</option>
            <option value="1">Yesterday</option>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} days ago
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 font-semibold">
        In your own words
        <input name="description" required maxLength={300} placeholder="e.g. Walked to the shops and back" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 font-semibold">
          Amount <span className="text-sm font-normal text-muted">(optional)</span>
          <input name="value" type="number" min={0} step="any" inputMode="decimal" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Unit
          <select name="unit" className={field} defaultValue="">
            <option value="">—</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="cigarettes">cigarettes</option>
            <option value="steps">steps</option>
            <option value="km">km</option>
            <option value="servings">servings</option>
          </select>
        </label>
      </div>
      {goals.length > 0 && (
        <label className="flex flex-col gap-1.5 font-semibold">
          Counts towards a goal?
          <select name="goalId" className={field} defaultValue="">
            <option value="">No</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <SubmitButton className="self-start">Save check-in</SubmitButton>
    </form>
  );
}

export function CorrectEntryForm({ id, value, description }: { id: string; value: string | null; description: string | null }) {
  const [state, action] = useActionState(correctEntry, initial);
  return (
    <form action={action} className="mt-2 flex flex-col gap-2 rounded-xl bg-background p-3">
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Correct amount
          <input name="value" type="number" min={0} step="any" defaultValue={value ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Correct description
          <input name="description" maxLength={300} defaultValue={description ?? ""} className={field} />
        </label>
      </div>
      <SubmitButton variant="secondary" className="self-start">
        Save correction
      </SubmitButton>
    </form>
  );
}

export function AddGoalForm() {
  const [state, action] = useActionState(addGoal, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state} />
      <label className="flex flex-col gap-1.5 font-semibold">
        Goal
        <input name="title" required maxLength={80} placeholder="e.g. Stretch in the morning" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 font-semibold">
          Area
          <select name="type" className={field} defaultValue="activity">
            <option value="activity">Activity</option>
            <option value="nutrition">Food</option>
            <option value="sleep">Sleep</option>
            <option value="smoking">Smoking</option>
            <option value="wellbeing">Wellbeing</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Times a week <span className="text-sm font-normal text-muted">(optional)</span>
          <input name="timesPerWeek" type="number" min={1} max={14} className={field} />
        </label>
      </div>
      <SubmitButton variant="secondary" className="self-start">
        Add goal
      </SubmitButton>
    </form>
  );
}
