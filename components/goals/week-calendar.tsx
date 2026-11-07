"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { logOneToday, markDone, moveSession, undo, type ActionResult } from "@/app/(patient)/goal-actions";
import { CatChip, CatIcon, Icon, Status, type StatusKind } from "@/components/kindly/parts";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { CalendarItem, CountProgress } from "@/lib/goals/schedule";
import { formatTime12h } from "@/lib/scheduling/occurrences";
import { addDays, dayOfWeek } from "@/lib/time";

export type GoalInfo = { schedule: string; notes: string | null; origin: string; reminder: string | null };
export type CalendarReminder = { id: string; title: string; time: string; days: number[]; channel: "in_app" | "phone" };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SESSION_CLASS: Record<CalendarItem["status"], string> = { done: "done", not_done: "notdone", postponed: "moved", planned: "planned" };

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(utc(date));
const dayTitle = (date: string) => fmt(date, { weekday: "long", day: "numeric", month: "long" });

/** "Planned" for today, "Coming up" for later days. */
function statusOf(item: CalendarItem, today: string): StatusKind {
  if (item.status === "planned" && item.date > today) return "upcoming";
  return item.status;
}

export function WeekRange({ weekStart }: { weekStart: string }) {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(5, 7) === end.slice(5, 7);
  const text = sameMonth
    ? `${Number(weekStart.slice(8))} – ${fmt(end, { day: "numeric", month: "long" })}`
    : `${fmt(weekStart, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "long" })}`;
  return (
    <p className="week-range" style={{ marginTop: 6 }}>
      {text.toUpperCase()}
    </p>
  );
}

export function WeekNav({ prevHref, nextHref, thisWeekHref }: { prevHref: string; nextHref: string; thisWeekHref: string | null }) {
  return (
    <nav className="week-nav" aria-label="Change week">
      <Link className="icon-btn" href={prevHref} aria-label="Previous week">
        <Icon name="chev-left" />
      </Link>
      {thisWeekHref && (
        <Link className="btn btn--ghost btn--sm" href={thisWeekHref}>
          This week
        </Link>
      )}
      <Link className="icon-btn" href={nextHref} aria-label="Next week">
        <Icon name="chev-right" />
      </Link>
    </nav>
  );
}

export function WeekCalendar(props: { weekStart: string; today: string; items: CalendarItem[]; counted: CountProgress[]; reminders: CalendarReminder[]; goalInfo: Record<string, GoalInfo> }) {
  const { weekStart, today, items, counted, reminders, goalInfo } = props;
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyGoal, setBusyGoal] = useState<string | null>(null);
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
      setBusyGoal(null);
      if (result.ok && close) setSelected(null);
    });

  return (
    <div className="stack-24">
      {feedback && !selected && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.ok ? feedback.message : feedback.error}</Notice>}

      {counted.length > 0 && (
        <ul className="stack" style={{ gap: 10 }} aria-label="Goals counted per week or month">
          {counted.map((goal) => {
            const percent = Math.min(100, Math.round((goal.done / goal.target) * 100));
            return (
              <li key={goal.goalId} className="meter">
                <CatIcon category={goal.category} size="sm" />
                <div>
                  <p className="meter__title">
                    {goal.title}{" "}
                    <span className="meter__count">
                      · {goal.done} of {goal.target} this {goal.period}
                    </span>
                  </p>
                  <div className="bar" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={goal.done}>
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
                {currentWeek ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-busy={busyGoal === goal.goalId || undefined}
                    onClick={() => {
                      setBusyGoal(goal.goalId);
                      run(() => logOneToday(goal.goalId), false);
                    }}
                  >
                    <Icon name="plus" className="icon--sm" />
                    Did one today
                  </Button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ol className="week">
        {days.map((date) => {
          const dayItems = items.filter((item) => item.date === date);
          const dayReminders = reminders.filter((reminder) => reminder.days.includes(dayOfWeek(date)));
          const isToday = date === today;
          return (
            <li key={date} className={`week__day ${isToday ? "week__day--today" : ""}`} aria-current={isToday ? "date" : undefined} aria-label={dayTitle(date)}>
              <div className="week__date">
                <p className="week__dow">
                  {DAY_NAMES[dayOfWeek(date)]}
                  {isToday && <span className="today-tag">Today</span>}
                </p>
                <p className="week__num">{fmt(date, { day: "numeric", month: "short" }).toUpperCase()}</p>
              </div>
              <div className="week__items">
                {dayItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-haspopup="dialog"
                    className={`session session--${SESSION_CLASS[item.status]}`}
                    onClick={() => {
                      setFeedback(null);
                      setSelected(item);
                    }}
                  >
                    <CatIcon category={item.category} size="sm" label />
                    <span>
                      <span className="session__title" style={{ display: "block" }}>
                        {item.title}
                      </span>
                      <span className="session__meta">
                        <span>{item.time ? formatTime12h(item.time) : "Any time"}</span>
                        {goalInfo[item.goalId]?.reminder && (
                          <span className="row" style={{ gap: 4 }}>
                            <Icon name="bell" />
                            <span className="sr-only">Reminder set</span>
                          </span>
                        )}
                        <Status kind={statusOf(item, today)} />
                      </span>
                    </span>
                  </button>
                ))}
                {dayReminders.map((reminder) => (
                  <Link key={reminder.id} href="/schedule" className="reminder-row" style={{ textDecoration: "none" }}>
                    <Icon name="bell" />
                    <span>
                      <strong style={{ fontWeight: 500 }}>Reminder</strong> · {reminder.title} · {formatTime12h(reminder.time)}
                    </span>
                  </Link>
                ))}
                {dayItems.length === 0 && dayReminders.length === 0 && <p className="week__empty">Nothing planned</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <dialog ref={dialogRef} className="dlg" aria-labelledby="dlg-title" onClose={() => setSelected(null)} onClick={(event) => event.target === dialogRef.current && setSelected(null)}>
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
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toDate, setToDate] = useState(item.date < today ? today : item.date);
  const [toTime, setToTime] = useState(item.time ?? "");
  const canAct = item.status === "planned" || item.status === "not_done";
  const options = Array.from({ length: 15 }, (_, i) => addDays(today, i));
  const act = (name: string, fn: () => void) => {
    setBusy(name);
    fn();
  };

  return (
    <>
      <div className="dlg__head">
        <div className="stack" style={{ gap: 10 }}>
          <CatChip category={item.category} />
          <h2 className="subhead" id="dlg-title">
            {item.title}
          </h2>
          <p className="muted">
            {dayTitle(item.date)}
            {item.time ? ` · ${formatTime12h(item.time)}` : " · any time"}
          </p>
        </div>
        <button className="icon-btn" type="button" onClick={props.onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="dlg__body">
        <dl className="facts">
          <dt>Status</dt>
          <dd>
            <Status kind={statusOf(item, today)} />
            {item.movedTo && <span className="small muted"> to {dayTitle(item.movedTo.date)}{item.movedTo.time ? `, ${formatTime12h(item.movedTo.time)}` : ""}</span>}
            {item.movedFrom && <span className="small muted"> (moved from {dayTitle(item.movedFrom.date)})</span>}
            {item.amount && <span className="small muted"> · {item.amount}</span>}
          </dd>
          {info && (
            <>
              <dt>Plan</dt>
              <dd>{info.schedule}</dd>
              <dt>Reminder</dt>
              <dd className="row" style={{ gap: 6 }}>
                {info.reminder ? (
                  <>
                    <Icon name="bell" className="icon--sm" />
                    {info.reminder}
                  </>
                ) : (
                  "No reminder"
                )}
              </dd>
              <dt>Notes</dt>
              <dd>{item.note ?? info.notes ?? "—"}</dd>
              <dt>Added</dt>
              <dd>{info.origin}</dd>
            </>
          )}
        </dl>

        {props.feedback && !props.feedback.ok && (
          <div style={{ marginTop: 20 }}>
            <Notice tone="error">{props.feedback.error}</Notice>
          </div>
        )}

        {moving && (
          <div className="move-panel">
            <p className="title">Move just this one</p>
            <p className="muted small" style={{ margin: "4px 0 16px" }}>
              Your usual plan stays the same.
            </p>
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="field">
                <label className="field__label" htmlFor="mv-day">
                  Day
                </label>
                <select className="select" id="mv-day" value={toDate} onChange={(event) => setToDate(event.target.value)}>
                  {options.map((date) => (
                    <option key={date} value={date}>
                      {date === today ? `Today (${fmt(date, { weekday: "short", day: "numeric", month: "short" })})` : fmt(date, { weekday: "short", day: "numeric", month: "short" })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="mv-time">
                  Time
                </label>
                <input className="input" id="mv-time" type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <Button disabled={props.pending} aria-busy={(busy === "move" && props.pending) || undefined} onClick={() => act("move", () => props.onMove(toDate, toTime))}>
                Move
              </Button>
              <Button variant="link" onClick={() => setMoving(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="dlg__actions">
          {canAct && item.date <= today && (
            <Button disabled={props.pending} aria-busy={(busy === "done" && props.pending) || undefined} onClick={() => act("done", props.onDone)}>
              <Icon name="check" />
              Mark done
            </Button>
          )}
          {(item.status === "done" || item.status === "postponed") && (
            <Button variant="ghost" disabled={props.pending} aria-busy={(busy === "undo" && props.pending) || undefined} onClick={() => act("undo", props.onUndo)}>
              <Icon name="undo" />
              {item.status === "done" ? "Undo done" : "Undo move"}
            </Button>
          )}
          {canAct && !moving && (
            <Button variant="ghost" onClick={() => setMoving(true)}>
              <Icon name="moved" />
              Move this one
            </Button>
          )}
          <Link className="btn btn--link" href="/goals" style={{ marginLeft: "auto" }}>
            <Icon name="edit" className="icon--sm" />
            Edit goal
          </Link>
        </div>
      </div>
    </>
  );
}
