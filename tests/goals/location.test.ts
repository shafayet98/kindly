import { describe, expect, it } from "vitest";
import { countryForTimezone, describeTimezone, isValidTimezone } from "@/lib/location/resolve";

describe("timezone helpers", () => {
  it("validates IANA timezones", () => {
    expect(isValidTimezone("Australia/Adelaide")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });

  it("finds the country for a timezone", () => {
    expect(countryForTimezone("Australia/Adelaide")).toBe("AU");
    expect(countryForTimezone("Asia/Dubai")).toBe("AE");
  });

  it("describes a timezone for display, including daylight time", () => {
    expect(describeTimezone("Australia/Adelaide", "AU", new Date("2026-11-07T00:00:00Z"))).toEqual({ place: "Adelaide", abbreviation: "ACDT", country: "Australia" });
    expect(describeTimezone("Australia/Adelaide", "AU", new Date("2026-07-01T00:00:00Z")).abbreviation).toBe("ACST");
  });
});
