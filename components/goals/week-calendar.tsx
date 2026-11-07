"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { logOneToday, markDone, moveSession, undo, type ActionResult } from "@/app/(patient)/goal-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { GOAL_CATEGORIES } from "@/lib/goals/categories";
import type { CalendarItem, CountProgress } from "@/lib/goals/schedule";
import { formatTime12h } from "@/lib/scheduling/occurrences";
import { addDays, dayOfWeek } from "@/lib/time";

export type GoalInfo = { schedule: string; notes: string | null; origin: string; reminder: string | null };
export type CalendarReminder = { id: string; title: string; time: string; days: number[]; channel: "in_app" | "phone" };

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS: Record<CalendarItem["status"], { label: string; className: string; mark: string }> = {
  done: { label: "Done", className: "border-primary/40 bg-primary-soft", mark: "✓" },
  not_done: { label: "Not done", className: "border-danger/30 bg-danger-soft/60", mark: "✗" },
  postponed: { label: "Moved", className: "border-dashed border-border bg-background text-muted line-through decoration-1", mark: "→" },
  planned: { label: "Planned", className: "border-border bg-surface", mark: "" },
};

function dayTitle(date: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function WeekCalendar(props: {
  weekStart: string;
  today: string;
  items: CalendarItem[];
  counted: CountProgress[];
  reminders: CalendarReminder[];
  goalInfo: Record<string, GoalInfo>;
  prevHref: string;
  nextHref: string;
  thisWeekHref: string | null;
}) {
  const { weekStart, today, items, counted, reminders, goalInfo } = props;
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const currentWeek = today >= weekStart && today <= addDays(weekStart, 6);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  const run = (action: () => Promise<ActionResult>, close = true) =>
    startTransition(async () => {
      const result = await action();
      setFeedback(result);
      if (result.ok && close) setSelected(null);
    });

  const range = `${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${days[0]}T00:00:00Z`))} – ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${days[6]}T00:00:00Z`))}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{range}</p>
        <nav aria-label="Weeks" className="flex items-center gap-1">
          <Link href={props.prevHref} className="rounded-full px-3 py-1.5 font-semibold text-primary hover:bg-primary-soft" aria-label="Previous week">
            ←
          </Link>
          {props.thisWeekHref && (
            <Link href={props.thisWeekHref} className="rounded-full px-3 py-1.5 font-semibold text-primary hover:bg-primary-soft">
              This week
            </Link>
          )}
          <Link href={props.nextHref} className="rounded-full px-3 py-1.5 font-semibold text-primary hover:bg-primary-soft" aria-label="Next week">
            →
          </Link>
        </nav>
      </div>

      {feedback && !selected && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.ok ? feedback.message : feedback.error}</Notice>}

      {counted.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Goals counted per week or month">
          {counted.map((goal) => {
            const percent = Math.min(100, Math.round((goal.done / goal.target) * 100));
            return (
              <li key={goal.goalId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                <span aria-hidden className="text-xl">
                  {GOAL_CATEGORIES[goal.category].icon}
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="font-semibold">
                    {goal.title} <span className="font-normal text-muted">· {goal.done} of {goal.target} this {goal.period}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={goal.done} aria-valuemin={0} aria-valuemax={goal.target} aria-label={`${goal.title} progress`}>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </span>
                </span>
                {currentWeek && (
                  <Button variant="secondary" className="px-3 py-1.5 text-sm" disabled={pending} onClick={() => run(() => logOneToday(goal.goalId), false)}>
                    Did one today
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ol className="grid gap-2 md:grid-cols-7">
        {days.map((date) => {
          const dayItems = items.filter((item) => item.date === date);
          const dayReminders = reminders.filter((reminder) => reminder.days.includes(dayOfWeek(date)));
          const isToday = date === today;
          return (
            <li key={date} aria-label={dayTitle(date)} className={`flex min-h-24 flex-col gap-1.5 rounded-2xl border p-2 ${isToday ? "border-primary bg-primary-soft/40" : "border-border bg-surface/60"}`}>
              <p className={`text-sm font-bold ${isToday ? "text-primary" : "text-muted"}`}>
                {DAY_SHORT[dayOfWeek(date)]} {Number(date.slice(8))}
                {isToday && " · Today"}
              </p>
              {dayItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setSelected(item);
                  }}
                  className={`flex w-full flex-col rounded-xl border px-2 py-1.5 text-left text-sm hover:border-primary ${STATUS[item.status].className}`}
                >
                  <span className="flex items-start gap-1 font-semibold leading-snug">
                    <span aria-hidden>{GOAL_CATEGORIES[item.category].icon}</span>
                    <span className="line-clamp-2 break-words">{item.title}</span>
                    {STATUS[item.status].mark && <span aria-hidden className="ml-auto">{STATUS[item.status].mark}</span>}
                  </span>
                  <span className="text-xs text-muted">
                    {item.time ? formatTime12h(item.time) : "Any time"}
                    {goalInfo[item.goalId]?.reminder && " · 🔔"}
                    <span className="sr-only"> · {STATUS[item.status].label}</span>
                  </span>
                </button>
              ))}
              {dayReminders.map((reminder) => (
                <Link key={reminder.id} href="/schedule" className="flex items-center gap-1 rounded-xl px-2 py-1 text-xs text-muted hover:bg-primary-soft">
                  <span aria-hidden>🔔</span>
                  {formatTime12h(reminder.time)} {reminder.title}
                </Link>
              ))}
              {dayItems.length === 0 && dayReminders.length === 0 && <p className="text-xs text-muted">Nothing planned</p>}
            </li>
          );
        })}
      </ol>

      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-3xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/30"
      >
        {selected && (
          <SessionDetails
            item={selected}
            info={goalInfo[selected.goalId]}
            today={today}
            pending={pending}
            feedback={feedback}
            onClose={() => setSelected(null)}
            onDone={() => run(() => markDone(selected.key))}
            onUndo={() => run(() => undo(selected.key))}
            onMove={(toDate, toTime) => run(() => moveSession(selected.key, toDate, toTime))}
          />
        )}
      </dialog>
    </div>
  );
}

function SessionDetails(props: {
  item: CalendarItem;
  info: GoalInfo | undefined;
  today: string;
  pending: boolean;
  feedback: ActionResult | null;
  onClose: () => void;
  onDone: () => void;
  onUndo: () => void;
  onMove: (toDate: string, toTime: string) => void;
}) {
  const { item, info, today } = props;
  const category = GOAL_CATEGORIES[item.category];
  const [moving, setMoving] = useState(false);
  const [toDate, setToDate] = useState(item.date < today ? today : item.date);
  const [toTime, setToTime] = useState(item.time ?? "");
  const canAct = item.status === "planned" || item.status === "not_done";
  const options = Array.from({ length: 15 }, (_, i) => addDays(today, i));

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${category.chip}`}>
            {category.icon} {category.label}
          </span>
          <h2 className="mt-1 text-xl font-bold">{item.title}</h2>
          <p className="text-muted">
            {dayTitle(item.date)}
            {item.time ? ` · ${formatTime12h(item.time)}` : " · any time"}
          </p>
        </div>
        <button type="button" onClick={props.onClose} aria-label="Close" className="rounded-full px-2 text-2xl leading-none text-muted hover:bg-background">
          ×
        </button>
      </div>

      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="font-semibold text-muted">Status</dt>
        <dd>
          {STATUS[item.status].label}
          {item.movedTo && ` to ${dayTitle(item.movedTo.date)}${item.movedTo.time ? `, ${formatTime12h(item.movedTo.time)}` : ""}`}
          {item.movedFrom && ` (moved from ${dayTitle(item.movedFrom.date)})`}
          {item.amount && ` · ${item.amount}`}
        </dd>
        {info && (
          <>
            <dt className="font-semibold text-muted">Plan</dt>
            <dd>{info.schedule}</dd>
            {info.reminder && (
              <>
                <dt className="font-semibold text-muted">Reminder</dt>
                <dd>🔔 {info.reminder}</dd>
              </>
            )}
            {(item.note || info.notes) && (
              <>
                <dt className="font-semibold text-muted">Notes</dt>
                <dd>{item.note ?? info.notes}</dd>
              </>
            )}
            <dt className="font-semibold text-muted">Added</dt>
            <dd>{info.origin}</dd>
          </>
        )}
      </dl>

      {props.feedback && !props.feedback.ok && <Notice tone="error">{props.feedback.error}</Notice>}

      {moving ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-background p-3">
          <p className="font-semibold">Move just this one</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Day
              <select value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl border border-border bg-surface px-2 py-2 font-normal">
                {options.map((date) => (
                  <option key={date} value={date}>
                    {date === today ? "Today" : dayTitle(date)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Time
              <input type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} className="rounded-xl border border-border bg-surface px-2 py-2 font-normal" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button disabled={props.pending} onClick={() => props.onMove(toDate, toTime)}>
              Move
            </Button>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canAct && item.date <= today && (
            <Button disabled={props.pending} onClick={props.onDone}>
              ✓ Mark done
            </Button>
          )}
          {canAct && (
            <Button variant="secondary" disabled={props.pending} onClick={() => setMoving(true)}>
              Move this one
            </Button>
          )}
          {(item.status === "done" || item.status === "postponed") && (
            <Button variant="secondary" disabled={props.pending} onClick={props.onUndo}>
              {item.status === "done" ? "Undo done" : "Undo move"}
            </Button>
          )}
          <Link href="/goals" className="self-center px-2 font-semibold text-primary underline-offset-4 hover:underline">
            Edit goal
          </Link>
        </div>
      )}
    </div>
  );
}
