import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

const LINKS = [
  { href: "/settings/location", title: "Location & timezone", detail: "So reminders happen at the right local time." },
  { href: "/settings/privacy", title: "Privacy & data", detail: "Permissions, what's remembered, export and deletion." },
  { href: "/schedule", title: "Reminders & calls", detail: "Times, quiet hours, and pausing calls." },
  { href: "/care-sharing", title: "Care sharing", detail: "What your clinician can see." },
  { href: "/activity", title: "Conversation activity", detail: "Who you spoke with, what they did, and conversation summaries." },
];

export default async function SettingsPage() {
  const user = await requireOnboardedPatient();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted">Signed in as {user.email}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="flex flex-col rounded-2xl border border-border bg-surface p-4 hover:border-primary hover:bg-primary-soft">
              <span className="font-bold">{link.title}</span>
              <span className="text-sm text-muted">{link.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
