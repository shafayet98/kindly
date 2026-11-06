import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { SubmitButton } from "@/components/ui/submit-button";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { recentHabitEvents } from "@/lib/habits/service";
import { formatTime12h } from "@/lib/scheduling/occurrences";
import { localDate } from "@/lib/time";
import { allowHealthData, archiveGoal } from "./actions";
import { AddGoalForm, CorrectEntryForm, LogCheckInForm } from "./forms";

export const metadata: Metadata = { title: "Goals & habits" };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

const KIND_LABEL: Record<string, string> = { activity: "Activity", food: "Food", smoking: "Smoking", sleep: "Sleep", mood: "Feeling", other: "Other" };

export default async function HabitsPage() {
  const user = await requireOnboardedPatient();
  const [consents, goals, events] = await Promise.all([
    getConsentState(user.id),
    db
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, user.id), inArray(schema.goals.status, ["active", "paused"])))
      .orderBy(asc(schema.goals.createdAt)),
    recentHabitEvents(user.id, daysAgo(14)),
  ]);

  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const day = localDate(event.occurredAt, user.timezone);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Goals & habits</h1>
        <p className="text-muted">Everything here is what you reported. You can tell Natalie instead of typing.</p>
      </div>

      <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
        <h2 id="goals-heading" className="text-xl font-bold">
          Your goals
        </h2>
        {goals.length === 0 && <p className="text-muted">No goals yet. Small ones work best.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => (
            <li key={goal.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <p className="font-bold">{goal.title}</p>
              <p className="text-sm text-muted">
                {typeof goal.target.timesPerWeek === "number" ? `${goal.target.timesPerWeek} times a week` : "No weekly target"}
                {typeof goal.target.minutes === "number" ? `, ${goal.target.minutes} minutes` : ""}
                {typeof goal.target.time === "string" ? ` · by ${formatTime12h(goal.target.time)}` : ""}
                {goal.planVersion > 1 ? ` · adjusted ${goal.planVersion - 1}×` : ""}
                {goal.approvedBy ? " · clinician-approved" : ""}
              </p>
              {!goal.approvedBy && (
                <form action={archiveGoal}>
                  <input type="hidden" name="id" value={goal.id} />
                  <SubmitButton variant="ghost" className="px-0 py-0">
                    Remove goal
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <details className="rounded-2xl border border-dashed border-border p-4">
          <summary className="cursor-pointer font-bold text-primary">Add a goal</summary>
          <div className="mt-3">
            <AddGoalForm />
          </div>
        </details>
      </section>

      <section aria-labelledby="log-heading" className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
        <h2 id="log-heading" className="text-xl font-bold">
          Log a check-in
        </h2>
        {consents.health_data_processing ? (
          <LogCheckInForm goals={goals.map((goal) => ({ id: goal.id, title: goal.title }))} />
        ) : (
          <form action={allowHealthData} className="flex flex-col gap-3">
            <p>
              To save check-ins, Kindly needs your permission to store what you tell it about activity, food, sleep, smoking
              and how you feel. It&apos;s only used to support you, and only shared with a clinician if you choose to.
            </p>
            <SubmitButton className="self-start">Allow saving my check-ins</SubmitButton>
          </form>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-xl font-bold">
          Last 14 days
        </h2>
        {byDay.size === 0 && <p className="text-muted">No check-ins yet.</p>}
        {[...byDay.entries()].map(([day, dayEvents]) => (
          <div key={day} className="flex flex-col gap-2">
            <h3 className="font-bold text-muted">{dayLabel(day)}</h3>
            <ul className="flex flex-col gap-2">
              {dayEvents.map((event) => (
                <li key={event.id} className="rounded-2xl border border-border bg-surface p-3">
                  <p>
                    <span className="font-bold">{KIND_LABEL[event.kind]}</span>
                    {event.value !== null && ` · ${Number(event.value)} ${event.unit ?? ""}`}
                    {event.description && <span className="text-muted"> · “{event.description}”</span>}
                  </p>
                  <p className="text-xs text-muted">
                    You reported{event.recordedByAgent ? ` to ${AGENTS[event.recordedByAgent].name}` : ""}
                    {event.correctedFrom ? " · corrected" : ""}
                  </p>
                  {consents.health_data_processing && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-primary">Correct this</summary>
                      <CorrectEntryForm id={event.id} value={event.value} description={event.description} />
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
