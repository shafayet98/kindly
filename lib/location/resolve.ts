import ct from "countries-and-timezones";

// Turning a location or a device timezone into a timezone + country. Pure and offline; nothing about
// where the person is leaves the server, and coordinates are never stored.

export function isValidTimezone(timezone: unknown): timezone is string {
  if (typeof timezone !== "string" || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function countryForTimezone(timezone: string): string | null {
  return ct.getTimezone(timezone)?.countries[0] ?? null;
}

export function countryName(code: string | null) {
  return code ? (ct.getCountry(code)?.name ?? code) : null;
}

/** e.g. { place: "Adelaide", abbreviation: "ACDT", country: "Australia" } for display. */
export function describeTimezone(timezone: string, countryCode: string | null, at = new Date()) {
  const abbreviation =
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, timeZoneName: "short" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? timezone;
  const place = timezone.split("/").pop()!.replace(/_/g, " ");
  return { place, abbreviation, country: countryName(countryCode ?? countryForTimezone(timezone)) };
}
