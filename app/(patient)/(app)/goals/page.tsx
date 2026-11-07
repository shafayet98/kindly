import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { removeGoal } from "@/app/(patient)/goal-actions";
import { AddGoal } from "@/components/goals/add-goal";
import { SubmitButton } from "@/components/ui/submit-button";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getCallSettings } from "@/lib/calls/settings";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { GOAL_CATEGORIES, GOAL_CATEGORY_KEYS } from "@/lib/goals/categories";
import { describeSchedule } from "@/lib/goals/describe";
import { activeGoals } from "@/lib/goals/service";
import { recentHabitEvents } from "@/lib/habits/service";
import { formatTime12h } from "@/lib/scheduling/occurrences";
import { localDate } from "@/lib/time";
import { allowHealthData } from "./actions";
import { EditGoalForm } from "./edit-goal";
import { CorrectEntryForm, LogCheckInForm } from "./forms";

export const metadata: Metadata = { title: "Goals" };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

const KIND_LABEL: Record<string, string> = { activity: "Activity", food: "Food", smoking: "Smoking", sleep: "Sleep", mood: "Feeling", other: "Other" };

export default async function GoalsPage() {
  const user = await requireOnboardedPatient();
  const [goals, consents, calls, events] = await Promise.all([
    activeGoals(user.id),
    getConsentState(user.id),
    getCallSettings(user.id),
    recentHabitEvents(user.id, daysAgo(14)),
  ]);
  const reminders = goals.length
    ? await db
        .select()
        .from(schema.reminders)
        .where(and(eq(schema.reminders.userId, user.id), inArray(schema.reminders.goalId, goals.map((goal) => goal.id)), inArray(schema.reminders.status, ["active", "paused"])))
    : [];
  const phoneCallsOn = Boolean(consents.outbound_calls && calls?.callsEnabled);
  const byCategory = GOAL_CATEGORY_KEYS.map((key) => ({ key, goals: goals.filter((goal) => goal.category === key) })).filter((group) => group.goals.length);
  const startDay = (date: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const dayLabel = (day: string) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Goals</h1>
        <p className="text-muted">Add goals here or just tell Natalie. Everything shows up on your weekly calendar.</p>
      </div>

      <section aria-labelledby="add-heading" className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
        <h2 id="add-heading" className="text-xl font-bold">
          Add a goal
        </h2>
        <AddGoal phoneCallsOn={phoneCallsOn} />
      </section>

      <section aria-labelledby="goals-heading" className="flex flex-col gap-4">
        <h2 id="goals-heading" className="text-xl font-bold">
          Your goals
        </h2>
        {byCategory.length === 0 && <p className="text-muted">No goals yet. Small ones work best.</p>}
        {byCategory.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <h3 className="font-bold text-muted">
              <span aria-hidden>{GOAL_CATEGORIES[group.key].icon}</span> {GOAL_CATEGORIES[group.key].label}
            </h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {group.goals.map((goal) => {
                const linked = reminders.filter((reminder) => reminder.goalId === goal.id);
                return (
                  <li key={goal.id} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
                    <p className="text-lg font-bold">{goal.title}</p>
                    <p className="text-sm">{describeSchedule(goal)}</p>
                    {linked.map((reminder) => (
                      <p key={reminder.id} className="text-sm text-muted">
                        🔔 {reminder.channel === "phone" ? "Phone call from Milo" : "In-app reminder"} at {formatTime12h(reminder.localTime)}
                        {reminder.status === "paused" ? " (paused)" : ""}
                      </p>
                    ))}
                    {goal.notes && <p className="text-sm text-muted">{goal.notes}</p>}
                    <p className="text-xs text-muted">
                      {goal.createdByAgent ? `Added by ${AGENTS[goal.createdByAgent].name}` : "Added by you"}
                      {goal.planVersion > 1 ? ` · current plan since ${startDay(goal.startsOn)}` : ""}
                      {goal.approvedBy ? " · clinician-approved" : ""}
                    </p>
                    {!goal.approvedBy && (
                      <div className="mt-1 flex flex-wrap items-start gap-3">
                        <details className="flex-1">
                          <summary className="cursor-pointer font-semibold text-primary">Edit</summary>
                          <EditGoalForm goalId={goal.id} initial={goal} />
                        </details>
                        <form action={removeGoal}>
                          <input type="hidden" name="goalId" value={goal.id} />
                          <SubmitButton variant="ghost" className="px-0 py-0" aria-label={`Remove ${goal.title}`}>
                            Remove
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <details className="rounded-3xl border border-border bg-surface p-5">
        <summary className="cursor-pointer text-xl font-bold">Other check-ins</summary>
        <p className="mt-2 text-muted">Things that aren&apos;t a goal, like how you slept or what you ate. You can also tell Natalie.</p>
        <div className="mt-4 flex flex-col gap-6">
          {consents.health_data_processing ? (
            <LogCheckInForm />
          ) : (
            <form action={allowHealthData} className="flex flex-col gap-3">
              <p>To save check-ins, Kindly needs your permission to store what you tell it about activity, food, sleep, smoking and how you feel.</p>
              <SubmitButton className="self-start">Allow saving my check-ins</SubmitButton>
            </form>
          )}
          {events.length > 0 && (
            <ul className="flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-2xl border border-border p-3">
                  <p>
                    <span className="font-bold">{KIND_LABEL[event.kind]}</span>
                    {event.value !== null && ` · ${Number(event.value)} ${event.unit ?? ""}`}
                    {event.description && <span className="text-muted"> · “{event.description}”</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {dayLabel(localDate(event.occurredAt, user.timezone))}
                    {event.recordedByAgent ? ` · told ${AGENTS[event.recordedByAgent].name}` : ""}
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
          )}
        </div>
      </details>
    </div>
  );
}
