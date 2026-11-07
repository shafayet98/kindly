import type { Metadata } from "next";
import { LocationPicker } from "@/components/location-picker";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { describeTimezone } from "@/lib/location/resolve";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Location & timezone" };

export default async function LocationSettingsPage() {
  const user = await requireOnboardedPatient();
  const [row] = await db.select({ source: schema.users.timezoneSource }).from(schema.users).where(eq(schema.users.id, user.id));
  const zone = describeTimezone(user.timezone, user.countryCode);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Location & timezone</h1>
        <p className="text-muted">Reminders and calls use this timezone, so 8:00 AM means 8:00 AM where you are.</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-lg font-bold">
          {zone.place} time ({zone.abbreviation}){zone.country ? `, ${zone.country}` : ""}
        </p>
        <p className="text-sm text-muted">
          {row?.source === "location" ? "Set from your location." : row?.source === "device" ? "Set from this device's timezone." : "Default setting."} Kindly keeps only the
          timezone and country, never your exact location.
        </p>
      </div>
      <div>
        <h2 className="mb-2 font-bold">Moved or travelling?</h2>
        <LocationPicker />
      </div>
    </div>
  );
}
