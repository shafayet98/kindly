// Timezone helpers built on Intl, so local wall-clock times stay correct across DST changes.

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/**
 * Converts a local date ("YYYY-MM-DD") and time ("HH:MM") in an IANA timezone to a UTC Date.
 * A time skipped by a DST jump resolves to the moment after the jump.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive - offsetMinutes(naive, timeZone) * 60_000;
  // Second pass corrects for the offset changing between the guess and the result.
  utc = naive - offsetMinutes(utc, timeZone) * 60_000;
  return new Date(utc);
}

/** The local calendar date ("YYYY-MM-DD") of an instant in a timezone. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday) of a "YYYY-MM-DD" date. */
export function dayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Monday that starts the week containing a "YYYY-MM-DD" date. */
export function weekStartOf(date: string) {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}
