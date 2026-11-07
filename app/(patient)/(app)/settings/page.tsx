import type { Metadata } from "next";
import Link from "next/link";
import { Icon, PageHead, type IconName } from "@/components/kindly/parts";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

const LINKS: { href: string; icon: IconName; title: string; detail: string }[] = [
  { href: "/settings/location", icon: "pin", title: "Location & timezone", detail: "So reminders happen at the right local time." },
  { href: "/settings/privacy", icon: "lock", title: "Privacy & data", detail: "Permissions, what's remembered, export and deletion." },
  { href: "/schedule", icon: "bell", title: "Reminders & calls", detail: "Times, quiet hours, and pausing calls." },
  { href: "/care-sharing", icon: "users", title: "Care sharing", detail: "What your clinician can see." },
  { href: "/activity", icon: "bubble", title: "Conversation activity", detail: "Who you spoke with, what they did, and conversation summaries." },
];

export default async function SettingsPage() {
  const user = await requireOnboardedPatient();
  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <PageHead title="Settings" sub={`Signed in as ${user.email}`} />
      <ul className="grid-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link className="list-card" href={link.href} style={{ padding: 24 }}>
              <span className="cat-icon">
                <Icon name={link.icon} />
              </span>
              <span>
                <span className="title" style={{ display: "block" }}>
                  {link.title}
                </span>
                <span className="muted">{link.detail}</span>
              </span>
              <Icon name="chev-right" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
