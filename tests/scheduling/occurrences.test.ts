import { describe, expect, it } from "vitest";
import { formatDays, formatTime12h, isWithinQuietHours, localClock, nextOccurrence } from "@/lib/scheduling/occurrences";

const TZ = "Australia/Adelaide";
const walk = { localTime: "08:00", daysOfWeek: [1, 3, 5], timezone: TZ };

describe("nextOccurrence (AC-13)", () => {
  it("finds the next listed weekday at the local time", () => {
    // Thursday 5 Nov 2026, 09:00 Adelaide (22:30Z on the 4th) -> Friday 6 Nov 08:00 local.
    const after = new Date("2026-11-04T22:30:00Z");
    expect(nextOccurrence(walk, after)?.toISOString()).toBe("2026-11-05T21:30:00.000Z");
  });

  it("returns later today when the time hasn't passed yet", () => {
    const after = new Date("2026-11-05T20:00:00Z"); // Fri 06:30 local
    expect(nextOccurrence({ ...walk, localTime: "17:00" }, after)?.toISOString()).toBe("2026-11-06T06:30:00.000Z");
  });

  it("keeps 8 AM local across the DST change (standard -> daylight)", () => {
    const saturdayBefore = new Date("2026-10-02T23:00:00Z"); // Sat 3 Oct 08:30 local (UTC+9:30)
    const next = nextOccurrence(walk, saturdayBefore)!; // Mon 5 Oct, now UTC+10:30
    expect(localClock(next, TZ)).toBe("08:00");
    expect(next.toISOString()).toBe("2026-10-04T21:30:00.000Z");
  });

  it("returns null when no days are selected", () => {
    expect(nextOccurrence({ ...walk, daysOfWeek: [] }, new Date())).toBeNull();
  });
});

describe("quiet hours (AC-41)", () => {
  it("handles ranges that wrap past midnight", () => {
    expect(isWithinQuietHours("22:30", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("07:59", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("08:00", "21:00", "08:00")).toBe(false);
    expect(isWithinQuietHours("12:00", "21:00", "08:00")).toBe(false);
  });

  it("handles same-day ranges and empty ranges", () => {
    expect(isWithinQuietHours("13:30", "13:00", "14:00")).toBe(true);
    expect(isWithinQuietHours("14:00", "13:00", "14:00")).toBe(false);
    expect(isWithinQuietHours("10:00", "09:00", "09:00")).toBe(false);
  });
});

describe("formatting", () => {
  it("formats times and day sets for people", () => {
    expect(formatTime12h("17:05")).toBe("5:05 PM");
    expect(formatTime12h("00:30")).toBe("12:30 AM");
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatDays([5, 1, 3])).toBe("Mon, Wed, Fri");
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Weekdays");
  });
});
