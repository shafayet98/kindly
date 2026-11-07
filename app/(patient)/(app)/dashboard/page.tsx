import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AddGoal } from "@/components/goals/add-goal";
import { WeekCalendar } from "@/components/goals/week-calendar";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getCallSettings } from "@/lib/calls/settings";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { hasGoals, loadCalendar, resolveWeek } from "@/lib/goals/calendar-data";

export const metadata: Metadata = { title: "Home" };

const COMPANIONS = ["natalie", "milo", "sarah"] as const;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireOnboardedPatient();
  const { week } = await searchParams;
  const weekStart = resolveWeek(week, user.timezone);
  const [calendar, anyGoals, profile, consents, calls] = await Promise.all([
    loadCalendar(user.id, user.timezone, weekStart),
    hasGoals(user.id),
    db.select({ nickname: schema.patientProfiles.nickname }).from(schema.patientProfiles).where(eq(schema.patientProfiles.userId, user.id)),
    getConsentState(user.id),
    getCallSettings(user.id),
  ]);
  const name = profile[0]?.nickname ?? user.displayName;
  const phoneCallsOn = Boolean(consents.outbound_calls && calls?.callsEnabled);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold">{name ? `Hi ${name}` : "Hi there"}. How can we help today?</h1>

      <section aria-label="Main actions" className="grid gap-4 sm:grid-cols-2">
        <MainAction href="/call?agent=natalie" title="Talk now" detail="Start with Natalie, or ask for anyone" primary />
        <MainAction href="/progress" title="Progress" detail="See what you've done, week by week" />
      </section>

      <section aria-labelledby="week-heading" className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="week-heading" className="text-xl font-bold">
            Your week
          </h2>
          <Link href="/goals" className="font-semibold text-primary underline-offset-4 hover:underline">
            Manage goals
          </Link>
        </div>
        {anyGoals || calendar.items.length > 0 ? (
          <WeekCalendar {...calendar} />
        ) : (
          <p className="text-muted">No goals yet. Add one below, or just tell Natalie what you&apos;d like to do.</p>
        )}
        <details className="rounded-2xl border border-dashed border-border p-4" open={!anyGoals}>
          <summary className="cursor-pointer font-bold text-primary">Add a goal</summary>
          <div className="mt-3">
            <AddGoal phoneCallsOn={phoneCallsOn} />
          </div>
        </details>
      </section>

      <section aria-labelledby="companions-heading" className="flex flex-col gap-3">
        <h2 id="companions-heading" className="text-xl font-bold">
          Your companions
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {COMPANIONS.map((key) => (
            <li key={key}>
              <Link href={`/call?agent=${key}`} className="flex h-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 hover:border-primary hover:bg-primary-soft">
                <span className="font-bold">
                  {AGENTS[key].name} <span className="font-normal text-muted">· {AGENTS[key].role}</span>
                </span>
                <span className="text-sm text-muted">{AGENTS[key].helpsWith}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/agents" className="font-semibold text-primary underline-offset-4 hover:underline">
            Meet the whole team
          </Link>
          <Link href="/check-in/unwell" className="font-semibold text-primary underline-offset-4 hover:underline">
            Feeling unwell?
          </Link>
        </div>
      </section>
    </div>
  );
}

function MainAction({ href, title, detail, primary = false }: { href: string; title: string; detail: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-h-28 flex-col justify-between rounded-3xl p-5 shadow-sm transition-colors ${
        primary ? "bg-primary text-white hover:bg-primary-hover" : "border border-border bg-surface hover:border-primary hover:bg-primary-soft"
      }`}
    >
      <span className="text-2xl font-extrabold">{title}</span>
      <span className={primary ? "text-white/90" : "text-muted"}>{detail}</span>
    </Link>
  );
}
