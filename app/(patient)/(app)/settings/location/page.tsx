import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { BackLink, Icon, PageHead } from "@/components/kindly/parts";
import { LocationPicker } from "@/components/location-picker";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { describeTimezone } from "@/lib/location/resolve";

export const metadata: Metadata = { title: "Location & timezone" };

export default async function LocationSettingsPage() {
  const user = await requireOnboardedPatient();
  const [row] = await db.select({ source: schema.users.timezoneSource }).from(schema.users).where(eq(schema.users.id, user.id));
  const zone = describeTimezone(user.timezone, user.countryCode);
  const how = row?.source === "location" ? "Set from your location." : row?.source === "device" ? "Set from this device's timezone." : "Default setting.";
  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <BackLink href="/settings">Settings</BackLink>
      <PageHead title="Location & timezone" sub="Reminders and calls use this timezone, so 8:00 AM means 8:00 AM where you are." />
      <div className="card card--lg card--bubble row nowrap" style={{ gap: 20 }}>
        <span className="cat-icon" style={{ width: 56, height: 56, background: "var(--ember)" }}>
          <Icon name="pin" className="icon--lg" />
        </span>
        <div>
          <p className="label">CURRENT</p>
          <p className="subhead" style={{ marginTop: 4 }}>
            {zone.place} time ({zone.abbreviation})
            {zone.country ? `, ${zone.country}` : ""}
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            {how} Kindly keeps only the timezone and country, never your exact location.
          </p>
        </div>
      </div>
      <section className="stack" style={{ marginTop: 40 }} aria-labelledby="mv-h">
        <h2 id="mv-h" className="title">
          Moved or travelling?
        </h2>
        <LocationPicker />
      </section>
    </div>
  );
}
