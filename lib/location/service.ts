import "server-only";
import { find } from "geo-tz/now";
import { and, eq, ne } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { scheduleNextJob } from "@/lib/scheduling/jobs";
import { countryForTimezone, isValidTimezone } from "./resolve";

export class LocationError extends Error {}

/** Timezone and country for a point, using offline boundary data. */
export function locate(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new LocationError("That location doesn't look right.");
  }
  const timezone = find(latitude, longitude).find(isValidTimezone);
  if (!timezone || timezone.startsWith("Etc/")) throw new LocationError("We couldn't work out a timezone for that location.");
  return { timezone, countryCode: countryForTimezone(timezone) };
}

/**
 * Saves the person's timezone and country (never coordinates) and moves their reminders to it, so
 * an 8:00 reminder stays at 8:00 local time.
 */
export async function setUserTimezone(userId: string, timezone: string, countryCode: string | null, source: "location" | "device") {
  if (!isValidTimezone(timezone)) throw new LocationError("Unknown timezone.");
  const [before] = await db.select({ timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.id, userId));
  await db.update(schema.users).set({ timezone, countryCode, timezoneSource: source }).where(eq(schema.users.id, userId));
  const moved = await db
    .update(schema.reminders)
    .set({ timezone })
    .where(and(eq(schema.reminders.userId, userId), ne(schema.reminders.status, "cancelled")))
    .returning({ id: schema.reminders.id });
  for (const reminder of moved) await scheduleNextJob(reminder.id);
  await audit({
    actorUserId: userId,
    actorType: "patient",
    resourceType: "user",
    resourceId: userId,
    action: "timezone.set",
    result: "success",
    metadata: { source, changed: before?.timezone !== timezone },
  });
}
