"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/session";
import { countryForTimezone, describeTimezone, isValidTimezone } from "@/lib/location/resolve";
import { locate, LocationError, setUserTimezone } from "@/lib/location/service";

export type LocationResult = { ok: true; label: string } | { ok: false; error: string };

const coords = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

function label(timezone: string, countryCode: string | null) {
  const { place, abbreviation, country } = describeTimezone(timezone, countryCode);
  return `${place} time (${abbreviation})${country ? `, ${country}` : ""}`;
}

/** Uses the browser's location once to set the timezone and country. Coordinates aren't stored. */
export async function setTimezoneFromLocation(latitude: number, longitude: number): Promise<LocationResult> {
  const user = await requirePatient();
  const point = coords.safeParse({ latitude, longitude });
  if (!point.success) return { ok: false, error: "That location doesn't look right." };
  try {
    const { timezone, countryCode } = locate(point.data.latitude, point.data.longitude);
    await setUserTimezone(user.id, timezone, countryCode, "location");
    revalidatePath("/schedule");
    return { ok: true, label: label(timezone, countryCode) };
  } catch (error) {
    if (error instanceof LocationError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Falls back to the device's timezone setting. */
export async function setTimezoneFromDevice(timezone: string): Promise<LocationResult> {
  const user = await requirePatient();
  if (!isValidTimezone(timezone)) return { ok: false, error: "We couldn't read this device's timezone." };
  const countryCode = countryForTimezone(timezone);
  await setUserTimezone(user.id, timezone, countryCode, "device");
  revalidatePath("/schedule");
  return { ok: true, label: label(timezone, countryCode) };
}
