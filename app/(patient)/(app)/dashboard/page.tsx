import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { getFocusAreas } from "@/lib/preferences/store";
import { rankQuickActions, suggestedAgents } from "@/lib/preferences/suggestions";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await requireOnboardedPatient();
  const [areas, profile, activeGoals, upcoming] = await Promise.all([
    getFocusAreas(user.id),
    db.select({ nickname: schema.patientProfiles.nickname }).from(schema.patientProfiles).where(eq(schema.patientProfiles.userId, user.id)),
    db
      .select({ id: schema.goals.id, title: schema.goals.title })
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, user.id), eq(schema.goals.status, "active")))
      .orderBy(asc(schema.goals.createdAt))
      .limit(3),
    db
      .select({ id: schema.reminders.id, title: schema.reminders.title, localTime: schema.reminders.localTime, channel: schema.reminders.channel })
      .from(schema.reminders)
      .where(and(eq(schema.reminders.userId, user.id), eq(schema.reminders.status, "active")))
      .orderBy(asc(schema.reminders.localTime))
      .limit(1),
  ]);

  const name = profile[0]?.nickname ?? user.displayName;
  const companions = suggestedAgents(areas);
  const firstCompanion = AGENTS[companions[0]];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold">{name ? `Hi ${name}` : "Hi there"}. How can we help today?</h1>

      <section aria-label="Main actions" className="grid gap-4 sm:grid-cols-3">
        <MainAction href={`/call?agent=${firstCompanion.key}`} title="Talk now" detail={`Start with ${firstCompanion.name}, or ask for anyone`} primary />
        <MainAction href="/schedule" title="Change reminders" detail={upcoming[0] ? `Next: ${upcoming[0].title} at ${formatTime(upcoming[0].localTime)}` : "Set up your first reminder"} />
        <MainAction href="/progress" title="View progress" detail={activeGoals.length ? `${activeGoals.length} active goal${activeGoals.length > 1 ? "s" : ""}` : "See how things are going"} />
      </section>

      <section aria-labelledby="today-heading" className="flex flex-col gap-3">
        <h2 id="today-heading" className="font-bold text-muted">
          What do you need today?
        </h2>
        <ul className="flex flex-wrap gap-2">
          {rankQuickActions(areas).map((action) => (
            <li key={action.key}>
              <Link href={action.href} className="inline-block rounded-full border border-border bg-surface px-4 py-2 font-semibold hover:border-primary hover:bg-primary-soft">
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="goals-heading" className="rounded-3xl border border-border bg-surface p-5">
          <h2 id="goals-heading" className="text-lg font-bold">
            Your goals
          </h2>
          {activeGoals.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {activeGoals.map((goal) => (
                <li key={goal.id} className="rounded-xl bg-primary-soft px-4 py-3 font-semibold">
                  {goal.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">No goals yet. Natalie can help you pick a small one.</p>
          )}
          <Link href="/habits" className="mt-3 inline-block font-semibold text-primary underline-offset-4 hover:underline">
            Manage goals
          </Link>
        </section>

        <section aria-labelledby="companions-heading" className="rounded-3xl border border-border bg-surface p-5">
          <h2 id="companions-heading" className="text-lg font-bold">
            Your companions
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {companions.map((key) => (
              <li key={key}>
                <Link href={`/call?agent=${key}`} className="flex flex-col rounded-xl px-4 py-3 hover:bg-primary-soft">
                  <span className="font-bold">
                    {AGENTS[key].name} <span className="font-normal text-muted">· {AGENTS[key].role}</span>
                  </span>
                  <span className="text-sm text-muted">{AGENTS[key].helpsWith}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/agents" className="mt-1 inline-block font-semibold text-primary underline-offset-4 hover:underline">
            Meet the whole team
          </Link>
        </section>
      </div>

      <Link href="/settings/focus-areas" className="self-start font-semibold text-primary underline-offset-4 hover:underline">
        Edit focus areas
      </Link>
    </div>
  );
}

function MainAction({ href, title, detail, primary = false }: { href: string; title: string; detail: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-h-32 flex-col justify-between rounded-3xl p-5 shadow-sm transition-colors ${
        primary ? "bg-primary text-white hover:bg-primary-hover" : "border border-border bg-surface hover:border-primary hover:bg-primary-soft"
      }`}
    >
      <span className="text-2xl font-extrabold">{title}</span>
      <span className={primary ? "text-white/90" : "text-muted"}>{detail}</span>
    </Link>
  );
}

function formatTime(localTime: string) {
  const [hours, minutes] = localTime.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
