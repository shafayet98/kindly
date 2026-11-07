import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { removeGoal } from "@/app/(patient)/goal-actions";
import { AddGoal } from "@/components/goals/add-goal";
import { Avatar, categoryIcon, CatIcon, Icon, PageHead, PanelSummary } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
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

const KIND_LABEL: Record<string, string> = { activity: "Activity", food: "Food & drink", smoking: "Smoking", sleep: "Sleep", mood: "Mood", other: "Other" };
const KIND_CATEGORY = { activity: "walk", food: "food_drink", smoking: "smoking", sleep: "sleep", mood: "mindfulness", other: "other" } as const;

export default async function GoalsPage() {
  const user = await requireOnboardedPatient();
  const [goals, consents, calls, events] = await Promise.all([activeGoals(user.id), getConsentState(user.id), getCallSettings(user.id), recentHabitEvents(user.id, daysAgo(14))]);
  const reminders = goals.length
    ? await db
        .select()
        .from(schema.reminders)
        .where(and(eq(schema.reminders.userId, user.id), inArray(schema.reminders.goalId, goals.map((goal) => goal.id)), inArray(schema.reminders.status, ["active", "paused"])))
    : [];
  const phoneCallsOn = Boolean(consents.outbound_calls && calls?.callsEnabled);
  const byCategory = GOAL_CATEGORY_KEYS.map((key) => ({ key, goals: goals.filter((goal) => goal.category === key) })).filter((group) => group.goals.length);
  const shortDate = (date: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const dayLabel = (day: string) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)).replace(",", "");

  return (
    <>
      <PageHead title="Goals" sub="Add goals here or just tell Natalie. Everything shows up on your weekly calendar." />
      <div className="split">
        <div className="stack-48">
          <section className="card card--lg card--bubble stack-24" aria-labelledby="add-h">
            <div className="row row--between">
              <h2 id="add-h" className="subhead">
                Add a goal
              </h2>
              <ButtonLink variant="ghost" size="sm" href="/call?agent=natalie">
                <Icon name="mic" className="icon--sm" />
                Or tell Natalie
              </ButtonLink>
            </div>
            <AddGoal phoneCallsOn={phoneCallsOn} idPrefix="goals" />
          </section>

          <section className="stack-32" aria-labelledby="yg">
            <div className="row row--between">
              <h2 id="yg" className="subhead">
                Your goals
              </h2>
              <span className="label">
                {goals.length} goal{goals.length === 1 ? "" : "s"}
              </span>
            </div>
            {byCategory.length === 0 && (
              <div className="empty">
                <span className="empty__art">
                  <Icon name="calendar" className="icon--xl" />
                </span>
                <p className="title">No goals yet</p>
                <p className="muted small">Small ones work best. Type one above, or just tell Natalie.</p>
              </div>
            )}
            {byCategory.map((group) => (
              <section key={group.key} className="stack" style={{ gap: 0 }} aria-label={GOAL_CATEGORIES[group.key].label}>
                <h3 className="cat-head label" style={{ fontSize: 14 }}>
                  <Icon name={categoryIcon(group.key)} className="icon--sm" />
                  {GOAL_CATEGORIES[group.key].label.toUpperCase()}
                </h3>
                <div className="stack">
                  {group.goals.map((goal) => {
                    const linked = reminders.filter((reminder) => reminder.goalId === goal.id);
                    const by = goal.createdByAgent;
                    return (
                      <article key={goal.id} className="card goal-card">
                        <div className="card-grid">
                          <CatIcon category={goal.category} />
                          <div>
                            <h4 className="title">{goal.title}</h4>
                            <div className="goal-card__meta">
                              <p className="row">
                                <Icon name="calendar" className="icon--sm" />
                                <span>{describeSchedule(goal)}</span>
                              </p>
                              {linked.map((reminder) => (
                                <p key={reminder.id} className="row">
                                  <Icon name={reminder.channel === "phone" ? "phone" : "bell"} className="icon--sm" />
                                  <span>
                                    {reminder.channel === "phone" ? "Phone call from Milo" : "In-app reminder"} at {formatTime12h(reminder.localTime)}
                                    {reminder.status === "paused" ? " (paused)" : ""}
                                  </span>
                                </p>
                              ))}
                              {goal.notes && (
                                <p className="row muted">
                                  <Icon name="edit" className="icon--sm" />
                                  <span>{goal.notes}</span>
                                </p>
                              )}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              <span className="by">
                                {by ? (
                                  <Avatar agent={by} />
                                ) : (
                                  <span className="avatar avatar--human" style={{ ["--size" as string]: "22px", fontSize: 11 }} aria-hidden="true">
                                    Y
                                  </span>
                                )}
                                {by ? `Added by ${AGENTS[by].name}` : "Added by you"}
                                {goal.planVersion > 1 ? ` · current plan since ${shortDate(goal.startsOn)}` : ""}
                                {goal.approvedBy ? " · clinician-approved" : ""}
                              </span>
                            </div>
                          </div>
                          {goal.approvedBy ? (
                            <span />
                          ) : (
                            <form action={removeGoal}>
                              <input type="hidden" name="goalId" value={goal.id} />
                              <SubmitButton variant="link" size="sm" className="link--danger" aria-label={`Remove ${goal.title}`}>
                                Remove
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                        {!goal.approvedBy && (
                          <details className="panel panel-sm dashed" style={{ marginTop: 18 }}>
                            <PanelSummary icon="edit">Edit</PanelSummary>
                            <div className="panel__body" style={{ paddingTop: 12 }}>
                              <EditGoalForm goalId={goal.id} initial={goal} />
                            </div>
                          </details>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>

          <details className="panel">
            <summary>
              <Icon name="plus" />
              <span>
                Other check-ins
                <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                  Log things that aren&apos;t goals, like sleep, food or mood
                </span>
              </span>
              <Icon name="chev-down" className="chev" />
            </summary>
            <div className="panel__body stack-32">
              {consents.health_data_processing ? (
                <LogCheckInForm />
              ) : (
                <form action={allowHealthData} className="card card--sunken stack">
                  <p>To save check-ins, Kindly needs your permission to store what you tell it about activity, food, sleep, smoking and how you feel.</p>
                  <div>
                    <SubmitButton>Allow saving my check-ins</SubmitButton>
                  </div>
                </form>
              )}
              {events.length > 0 && (
                <div className="stack">
                  <p className="label">Last 14 days</p>
                  <ul className="rows">
                    {events.map((event) => (
                      <li key={event.id} style={{ gridTemplateColumns: "1fr" }}>
                        <div className="row nowrap" style={{ gap: 12 }}>
                          <CatIcon category={KIND_CATEGORY[event.kind]} size="sm" />
                          <span>
                            <span style={{ fontWeight: 500 }}>{KIND_LABEL[event.kind]}</span>
                            {event.value !== null && ` · ${Number(event.value)} ${event.unit ?? ""}`}
                            {event.description && <span className="muted"> · “{event.description}”</span>}
                            <span className="rows__sub" style={{ display: "block" }}>
                              {dayLabel(localDate(event.occurredAt, user.timezone))}
                              {event.recordedByAgent ? ` · told ${AGENTS[event.recordedByAgent].name}` : ""}
                              {event.correctedFrom ? " · corrected" : ""}
                            </span>
                          </span>
                        </div>
                        {consents.health_data_processing && (
                          <details>
                            <summary className="btn btn--link btn--sm" style={{ listStyle: "none" }}>
                              Correct this
                            </summary>
                            <CorrectEntryForm id={event.id} value={event.value} description={event.description} />
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </div>

        <aside className="sticky stack-24">
          <div className="card stack">
            <p className="title">How goals work</p>
            <ul className="stack">
              <li className="row nowrap top">
                <Icon name="calendar" />
                <span className="small">Each goal shows on your week on Home, with its reminder.</span>
              </li>
              <li className="row nowrap top">
                <Icon name="shield" />
                <span className="small">Companions change a goal only after you say yes.</span>
              </li>
              <li className="row nowrap top">
                <Icon name="check" />
                <span className="small">Missed sessions show as “Not done” — nothing more.</span>
              </li>
            </ul>
          </div>
          <Link className="card row nowrap" href="/dashboard" style={{ textDecoration: "none" }}>
            <Icon name="home" />
            <span style={{ fontWeight: 500 }}>See this week on Home</span>
            <Icon name="chev-right" className="icon--sm" />
          </Link>
        </aside>
      </div>
    </>
  );
}
