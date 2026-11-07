import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { GOAL_CATEGORIES } from "@/lib/goals/categories";
import type { CalendarItem } from "@/lib/goals/schedule";
import { loadInsights } from "@/lib/insights/load";
import { formatTime12h } from "@/lib/scheduling/occurrences";
import { addDays } from "@/lib/time";

export const metadata: Metadata = { title: "Progress" };

const STATUS: Record<CalendarItem["status"], { label: string; className: string }> = {
  done: { label: "Done", className: "bg-primary-soft text-primary" },
  not_done: { label: "Not done", className: "bg-danger-soft text-danger" },
  postponed: { label: "Postponed", className: "bg-accent-soft text-foreground" },
  planned: { label: "Coming up", className: "bg-background text-muted" },
};

const shortDate = (day: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const weekday = (day: string) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export default async function ProgressPage() {
  const user = await requireOnboardedPatient();
  const insights = await loadInsights(user.id, user.timezone, 4);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Progress</h1>
        <p className="text-muted">Prepared by Iris from what you&apos;ve done and told Kindly. Open a week to see each session.</p>
      </div>

      <section aria-labelledby="weeks-heading" className="flex flex-col gap-3">
        <h2 id="weeks-heading" className="text-xl font-bold">
          Goals by week
        </h2>
        {insights.weeks.every((week) => week.categories.length === 0 && week.counted.length === 0) && (
          <p className="text-muted">
            Nothing to show yet. <Link href="/goals" className="font-semibold text-primary underline-offset-4 hover:underline">Add a goal</Link> and it appears here.
          </p>
        )}
        {insights.weeks.map((week, index) => {
          const { done, notDone, postponed, planned } = week.totals;
          if (week.categories.length === 0 && week.counted.length === 0) return null;
          return (
            <details key={week.weekStart} open={index === 0} className="group rounded-2xl border border-border bg-surface">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4">
                <span className="font-bold">
                  {index === 0 ? "This week" : `Week of ${shortDate(week.weekStart)}`}
                  <span className="font-normal text-muted"> · {shortDate(week.weekStart)} – {shortDate(addDays(week.weekStart, 6))}</span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-sm">
                  <Count n={done} label="done" className={STATUS.done.className} />
                  <Count n={notDone} label="not done" className={STATUS.not_done.className} />
                  <Count n={postponed} label="postponed" className={STATUS.postponed.className} />
                  {planned > 0 && <Count n={planned} label="coming up" className={STATUS.planned.className} />}
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t border-border p-4">
                {week.counted.map((goal) => (
                  <p key={goal.goalId} className="text-sm">
                    <span aria-hidden>{GOAL_CATEGORIES[goal.category].icon}</span> <strong>{goal.title}</strong>: {goal.done} of {goal.target} this {goal.period}
                  </p>
                ))}
                {week.categories.map((group) => (
                  <div key={group.category}>
                    <h3 className="mb-1.5 font-bold">
                      <span aria-hidden>{GOAL_CATEGORIES[group.category].icon}</span> {group.label}
                    </h3>
                    <ul aria-label={`${group.label} sessions`} className="flex flex-col divide-y divide-border rounded-xl border border-border">
                      {group.items.map((item) => (
                        <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span>
                            <span className="font-semibold">{item.title}</span>
                            <span className="text-sm text-muted">
                              {" "}
                              · {weekday(item.date)}
                              {item.time ? `, ${formatTime12h(item.time)}` : ""}
                              {item.amount ? ` · ${item.amount}` : ""}
                              {item.movedTo ? ` · moved to ${weekday(item.movedTo.date)}${item.movedTo.time ? ` ${formatTime12h(item.movedTo.time)}` : ""}` : ""}
                              {item.movedFrom ? ` · moved from ${weekday(item.movedFrom.date)}` : ""}
                            </span>
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[item.status].className}`}>{STATUS[item.status].label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </section>

      <section aria-labelledby="patterns-heading" className="flex flex-col gap-3">
        <h2 id="patterns-heading" className="text-xl font-bold">
          Patterns worth a chat
        </h2>
        <p className="text-sm text-muted">These happened around the same time. They don&apos;t show that one caused the other.</p>
        {insights.hypotheses.length === 0 ? (
          <p className="text-muted">Nothing stands out right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {insights.hypotheses.map((statement, index) => (
              <li key={index} className="rounded-xl border border-border bg-surface p-3">
                <p>{statement.text}</p>
                <p className="mt-1 text-sm text-muted">{statement.basis}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="changes-heading" className="flex flex-col gap-3">
        <h2 id="changes-heading" className="text-xl font-bold">
          Plan changes you approved
        </h2>
        {insights.planChanges.length === 0 ? (
          <p className="text-muted">No changes in the last four weeks.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {insights.planChanges.map((change) => (
              <li key={change.sources[0]} className="rounded-xl border border-border bg-surface p-3">
                <p className="font-semibold">{change.text}</p>
                <p className="mt-1 text-sm text-muted">
                  {change.basis}
                  {change.quote ? `: “${change.quote}”` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
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

function Count({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-bold ${className}`}>
      {n} {label}
    </span>
  );
}
