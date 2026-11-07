"use client";

import { useState } from "react";
import { GOAL_CATEGORIES, GOAL_CATEGORY_KEYS } from "@/lib/goals/categories";
import type { GoalInput } from "@/lib/goals/service";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field = "rounded-xl border border-border bg-surface px-3 py-2 font-normal";

/** The editable fields of a goal. Used when adding (pre-filled by the AI) and when editing. */
export function GoalFields({ initial, idPrefix }: { initial: GoalInput; idPrefix: string }) {
  const [cadence, setCadence] = useState(initial.cadence);
  const [days, setDays] = useState<number[]>(initial.daysOfWeek ?? (initial.cadence === "daily" ? [0, 1, 2, 3, 4, 5, 6] : []));
  const [times, setTimes] = useState<string[]>(initial.times.length ? initial.times : [""]);

  const toggleDay = (day: number) => setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1.5 font-semibold">
          Goal
          <input name="title" required maxLength={80} defaultValue={initial.title} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Category
          <select name="category" defaultValue={initial.category} className={field}>
            {GOAL_CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {GOAL_CATEGORIES[key].icon} {GOAL_CATEGORIES[key].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="font-semibold">How often</legend>
        <div className="flex flex-wrap gap-2">
          {(["daily", "weekly", "monthly"] as const).map((value) => (
            <label key={value} className="cursor-pointer rounded-full border border-border px-4 py-1.5 has-checked:border-primary has-checked:bg-primary-soft has-checked:font-bold">
              <input
                type="radio"
                name="cadence"
                value={value}
                checked={cadence === value}
                onChange={() => {
                  setCadence(value);
                  if (value === "daily" && days.length === 0) setDays([0, 1, 2, 3, 4, 5, 6]);
                }}
                className="sr-only"
              />
              {value === "daily" ? "Daily" : value === "weekly" ? "Weekly" : "Monthly"}
            </label>
          ))}
        </div>
      </fieldset>

      {cadence !== "daily" && (
        <label className="flex flex-col gap-1.5 font-semibold sm:max-w-xs">
          Times a {cadence === "weekly" ? "week" : "month"}
          <input name="targetCount" type="number" min={1} max={50} defaultValue={initial.targetCount} className={field} />
          {cadence === "weekly" && days.length > 0 && <span className="text-sm font-normal text-muted">Set by the days you pick below.</span>}
        </label>
      )}
      {cadence === "daily" && <input type="hidden" name="targetCount" value={Math.max(1, times.filter(Boolean).length || initial.targetCount)} />}

      {cadence !== "monthly" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-semibold">
            {cadence === "daily" ? "On these days" : "Which days"} <span className="font-normal text-muted">{cadence === "weekly" ? "(optional: leave empty for any days)" : ""}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((label, day) => (
              <label key={label} htmlFor={`${idPrefix}-day-${day}`} className="cursor-pointer rounded-full border border-border px-3 py-1.5 has-checked:border-primary has-checked:bg-primary-soft has-checked:font-bold">
                <input id={`${idPrefix}-day-${day}`} type="checkbox" name="day" value={day} checked={days.includes(day)} onChange={() => toggleDay(day)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {cadence !== "monthly" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-semibold">
            Time <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            {times.map((value, index) => (
              <input
                key={index}
                type="time"
                name="time"
                aria-label={`Time ${index + 1}`}
                value={value}
                onChange={(event) => setTimes((current) => current.map((t, i) => (i === index ? event.target.value : t)))}
                className={field}
              />
            ))}
            {times.length < 3 && times[times.length - 1] !== "" && (
              <button type="button" onClick={() => setTimes((current) => [...current, ""])} className="font-semibold text-primary">
                + another time
              </button>
            )}
          </div>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1.5 font-semibold">
          Minutes <span className="text-sm font-normal text-muted">(optional)</span>
          <input name="durationMinutes" type="number" min={1} max={600} defaultValue={initial.durationMinutes ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Notes <span className="text-sm font-normal text-muted">(optional)</span>
          <input name="notes" maxLength={300} defaultValue={initial.notes ?? ""} className={field} />
        </label>
      </div>
      {initial.category === "medication" && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">Kindly can remind you and keep track, but it never gives advice about doses. Follow your prescription.</p>
      )}
    </div>
  );
}
