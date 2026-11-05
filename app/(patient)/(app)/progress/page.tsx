import type { Metadata } from "next";
import Link from "next/link";
import { StatementList } from "@/components/reports/statement-list";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { loadInsights } from "@/lib/insights/load";

export const metadata: Metadata = { title: "Your progress" };

export default async function ProgressPage() {
  const user = await requireOnboardedPatient();
  const insights = await loadInsights(user.id, user.timezone, 4);
  const shortDate = (day: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Your progress</h1>
        <p className="text-muted">
          Prepared by Iris from what you reported, {shortDate(insights.period.from)} to {shortDate(insights.period.to)}. Iris
          only counts and compares; patterns are things to talk about, not conclusions.
        </p>
      </div>

      <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
        <h2 id="goals-heading" className="text-xl font-bold">
          Goals by week
        </h2>
        {insights.goals.length === 0 && (
          <p className="text-muted">
            Goals with a weekly target show up here. <Link href="/habits" className="font-semibold text-primary underline-offset-4 hover:underline">Add one</Link>.
          </p>
        )}
        {insights.goals.map((goal) => (
          <div key={goal.goalId} className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-bold">{goal.title}</p>
            <ol className="mt-3 grid grid-cols-4 gap-2" aria-label={`Weekly check-ins for ${goal.title}`}>
              {goal.weeks.map((week) => (
                <li key={week.weekStart} className={`rounded-xl p-2 text-center ${week.met ? "bg-primary-soft" : "bg-accent-soft"}`}>
                  <span className="block text-xs text-muted">w/c {shortDate(week.weekStart)}</span>
                  <span className="text-lg font-extrabold">
                    {week.count}/{week.target}
                  </span>
                  <span className="sr-only">{week.met ? "target met" : "below target"}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-muted">{goal.statement.text}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="obs-heading" className="flex flex-col gap-3">
        <h2 id="obs-heading" className="text-xl font-bold">
          What you reported
        </h2>
        <StatementList statements={insights.observations.map((s) => ({ ...s, kind: "observation" as const }))} />
      </section>

      <section aria-labelledby="patterns-heading" className="flex flex-col gap-3">
        <h2 id="patterns-heading" className="text-xl font-bold">
          Patterns worth a chat
        </h2>
        <p className="text-sm text-muted">These happened around the same time. They don&apos;t show that one caused the other.</p>
        <StatementList statements={insights.hypotheses.map((s) => ({ ...s, kind: "hypothesis" as const }))} />
      </section>

      <section aria-labelledby="changes-heading" className="flex flex-col gap-3">
        <h2 id="changes-heading" className="text-xl font-bold">
          Plan changes you approved
        </h2>
        <StatementList statements={insights.planChanges.map((s) => ({ ...s, kind: "system" as const }))} />
      </section>

      {insights.missingData.length > 0 && (
        <p className="rounded-2xl bg-background p-4 text-sm text-muted">{insights.missingData[0].text}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/call?agent=natalie" className="font-semibold text-primary underline-offset-4 hover:underline">
          Talk it through with Natalie
        </Link>
        <Link href="/care-sharing" className="font-semibold text-primary underline-offset-4 hover:underline">
          Share a summary with your clinician
        </Link>
      </div>
    </div>
  );
}
