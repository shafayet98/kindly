import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, localDate, zonedTimeToUtc } from "@/lib/time";

const ADELAIDE = "Australia/Adelaide";

describe("zonedTimeToUtc (AC-13)", () => {
  it("handles Adelaide daylight time (UTC+10:30)", () => {
    expect(zonedTimeToUtc("2026-11-05", "08:00", ADELAIDE).toISOString()).toBe("2026-11-04T21:30:00.000Z");
  });

  it("handles Adelaide standard time (UTC+9:30)", () => {
    expect(zonedTimeToUtc("2026-07-01", "08:00", ADELAIDE).toISOString()).toBe("2026-06-30T22:30:00.000Z");
  });

  it("keeps 8 AM local on both sides of the October 2026 DST start", () => {
    expect(zonedTimeToUtc("2026-10-03", "08:00", ADELAIDE).toISOString()).toBe("2026-10-02T22:30:00.000Z");
    expect(zonedTimeToUtc("2026-10-04", "08:00", ADELAIDE).toISOString()).toBe("2026-10-03T21:30:00.000Z");
  });

  it("moves a skipped time (02:30 on DST start) to just after the jump", () => {
    expect(localDate(zonedTimeToUtc("2026-10-04", "02:30", ADELAIDE), ADELAIDE)).toBe("2026-10-04");
  });
});

describe("date helpers", () => {
  it("adds days across month ends and reads the weekday", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(dayOfWeek("2026-11-05")).toBe(4);
  });
});
