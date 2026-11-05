import { addDays, dayOfWeek, localDate, zonedTimeToUtc } from "@/lib/time";

export type ReminderSchedule = { localTime: string; daysOfWeek: number[]; timezone: string };

/** The next time this reminder is due strictly after `after`, or null if it has no days. */
export function nextOccurrence(schedule: ReminderSchedule, after: Date): Date | null {
  if (schedule.daysOfWeek.length === 0) return null;
  const today = localDate(after, schedule.timezone);
  for (let offset = 0; offset <= 7; offset++) {
    const date = addDays(today, offset);
    if (!schedule.daysOfWeek.includes(dayOfWeek(date))) continue;
    const due = zonedTimeToUtc(date, schedule.localTime, schedule.timezone);
    if (due.getTime() > after.getTime()) return due;
  }
  return null;
}

function minutes(hhmm: string) {
  const [hours, mins] = hhmm.split(":").map(Number);
  return hours * 60 + mins;
}

/** Whether a local "HH:MM" falls inside quiet hours. Handles ranges that wrap past midnight. */
export function isWithinQuietHours(localTime: string, start: string, end: string): boolean {
  const time = minutes(localTime);
  const from = minutes(start);
  const to = minutes(end);
  if (from === to) return false;
  return from < to ? time >= from && time < to : time >= from || time < to;
}

/** "HH:MM" wall-clock time of an instant in a timezone. */
export function localClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

export function formatTime12h(hhmm: string) {
  const [hours, mins] = hhmm.split(":").map(Number);
  return `${((hours + 11) % 12) + 1}:${String(mins).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function formatDays(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return "Weekdays";
  return [...days].sort().map((day) => DAY_NAMES[day]).join(", ");
}
