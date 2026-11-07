"use client";

import { useState } from "react";
import { Icon } from "@/components/kindly/icon";
import { GOAL_CATEGORIES, GOAL_CATEGORY_KEYS } from "@/lib/goals/categories";
import type { GoalInput } from "@/lib/goals/service";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CADENCES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

/** The editable fields of a goal. Used when adding (pre-filled by the AI) and when editing. */
export function GoalFields({ initial, idPrefix }: { initial: GoalInput; idPrefix: string }) {
  const [cadence, setCadence] = useState(initial.cadence);
  const [days, setDays] = useState<number[]>(initial.daysOfWeek ?? (initial.cadence === "daily" ? [0, 1, 2, 3, 4, 5, 6] : []));
  const [times, setTimes] = useState<string[]>(initial.times.length ? initial.times : [""]);
  const id = (name: string) => `${idPrefix}-${name}`;

  const toggleDay = (day: number) => setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));

  return (
    <div className="stack-32">
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="field">
          <label className="field__label" htmlFor={id("title")}>
            Goal
          </label>
          <input className="input" id={id("title")} name="title" required maxLength={80} defaultValue={initial.title} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={id("cat")}>
            Category
          </label>
          <select className="select" id={id("cat")} name="category" defaultValue={initial.category}>
            {GOAL_CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {GOAL_CATEGORIES[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="fieldset">
        <legend>How often</legend>
        <div className="chips" role="radiogroup">
          {CADENCES.map((option) => (
            <span key={option.value}>
              <input
                className="chip-input"
                type="radio"
                name="cadence"
                id={id(`f-${option.value}`)}
                value={option.value}
                checked={cadence === option.value}
                onChange={() => {
                  setCadence(option.value);
                  if (option.value === "daily" && days.length === 0) setDays([0, 1, 2, 3, 4, 5, 6]);
                }}
              />
              <label className="chip" htmlFor={id(`f-${option.value}`)}>
                <Icon name="check" className="icon--sm chip__tick" />
                {option.label}
              </label>
            </span>
          ))}
        </div>
      </fieldset>

      {cadence !== "daily" ? (
        <div className="field">
          <label className="field__label" htmlFor={id("times-count")}>
            Times a {cadence === "weekly" ? "week" : "month"}
          </label>
          <input className="input input--num" id={id("times-count")} name="targetCount" type="number" min={1} max={50} defaultValue={initial.targetCount} />
          {cadence === "weekly" && days.length > 0 && <p className="field__hint">Set by the days you pick below.</p>}
        </div>
      ) : (
        <input type="hidden" name="targetCount" value={Math.max(1, times.filter(Boolean).length || initial.targetCount)} />
      )}

      {cadence !== "monthly" && (
        <fieldset className="fieldset">
          <legend>
            {cadence === "daily" ? "On these days" : "Which days"}{" "}
            {cadence === "weekly" && <span className="field__opt">(optional — leave empty for any days)</span>}
          </legend>
          <div className="chips chips--days">
            {DAYS.map((label, day) => (
              <span key={label}>
                <input className="chip-input" type="checkbox" id={id(`d-${day}`)} name="day" value={day} checked={days.includes(day)} onChange={() => toggleDay(day)} />
                <label className="chip" htmlFor={id(`d-${day}`)}>
                  {label}
                </label>
              </span>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-5 md:grid-cols-[auto_160px_1fr]">
        {cadence !== "monthly" ? (
          <div className="field">
            <span className="field__label">
              Time <span className="field__opt">(optional)</span>
            </span>
            <div className="row" style={{ gap: 4 }}>
              {times.map((value, index) => (
                <input
                  key={index}
                  className="input input--time"
                  type="time"
                  name="time"
                  aria-label={`Time ${index + 1}`}
                  value={value}
                  onChange={(event) => setTimes((current) => current.map((t, i) => (i === index ? event.target.value : t)))}
                />
              ))}
              {times.length < 3 && times[times.length - 1] !== "" && (
                <button type="button" className="btn btn--link btn--sm" onClick={() => setTimes((current) => [...current, ""])}>
                  <Icon name="plus" className="icon--sm" />
                  Another time
                </button>
              )}
            </div>
          </div>
        ) : (
          <span />
        )}
        <div className="field">
          <label className="field__label" htmlFor={id("min")}>
            Minutes <span className="field__opt">(optional)</span>
          </label>
          <input className="input input--num" id={id("min")} name="durationMinutes" type="number" min={1} max={600} defaultValue={initial.durationMinutes ?? ""} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={id("notes")}>
            Notes <span className="field__opt">(optional)</span>
          </label>
          <input className="input" id={id("notes")} name="notes" maxLength={300} defaultValue={initial.notes ?? ""} />
        </div>
      </div>

      {initial.category === "medication" && (
        <div className="notice notice--info">
          <Icon name="info" />
          <p>Kindly can remind you and keep track, but it never gives advice about doses. Follow your prescription.</p>
        </div>
      )}
    </div>
  );
}
