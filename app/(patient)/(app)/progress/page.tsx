import type { Metadata } from "next";
import Link from "next/link";
import { AiTag, Avatar, CatIcon, categoryIcon, Icon, PageHead, Status } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
import { AGENTS, type AgentKey } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import type { CalendarItem } from "@/lib/goals/schedule";
import { loadInsights } from "@/lib/insights/load";
import { formatTime12h } from "@/lib/scheduling/occurrences";
import { addDays } from "@/lib/time";

export const metadata: Metadata = { title: "Progress" };

const fmt = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)).replace(",", "");
const shortDate = (day: string) => fmt(day, { day: "numeric", month: "short" });
const weekday = (day: string) => fmt(day, { weekday: "short", day: "numeric" });

/** Which companion a provenance line mentions, for its avatar. */
function agentIn(text: string): AgentKey | null {
  return (Object.keys(AGENTS) as AgentKey[]).find((key) => text.includes(AGENTS[key].name)) ?? null;
}

function sessionSub(item: CalendarItem) {
  return [
    `${weekday(item.date)}${item.time ? `, ${formatTime12h(item.time)}` : ""}`,
    item.amount,
    item.movedTo ? `moved to ${weekday(item.movedTo.date)}${item.movedTo.time ? ` ${formatTime12h(item.movedTo.time)}` : ""}` : null,
    item.movedFrom ? `moved from ${weekday(item.movedFrom.date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function ProgressPage() {
  const user = await requireOnboardedPatient();
  const insights = await loadInsights(user.id, user.timezone, 4);
  const empty = insights.weeks.every((week) => week.categories.length === 0 && week.counted.length === 0);

  return (
    <>
      <PageHead title="Progress" sub="Prepared by Iris from what you've done and told Kindly. Open a week to see each session.">
        <div className="row nowrap" style={{ gap: 10 }}>
          <Avatar agent="iris" />
          <span>
            <span style={{ fontWeight: 500, display: "block" }}>
              Iris <AiTag />
            </span>
            <span className="companion__role">Insights & progress</span>
          </span>
        </div>
      </PageHead>
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <section className="stack" aria-labelledby="gw-h">
          <h2 id="gw-h" className="subhead" style={{ marginBottom: 8 }}>
            Goals by week
          </h2>
          {empty && (
            <p className="muted">
              Nothing to show yet.{" "}
              <Link className="link" href="/goals">
                Add a goal
              </Link>{" "}
              and it appears here.
            </p>
          )}
          {insights.weeks.map((week, index) => {
            if (week.categories.length === 0 && week.counted.length === 0) return null;
            const { done, notDone, postponed, planned } = week.totals;
            return (
              <details key={week.weekStart} className="panel" open={index === 0}>
                <summary style={{ flexWrap: "wrap" }}>
                  <span>
                    <span style={{ display: "block" }}>{index === 0 ? "This week" : `Week of ${shortDate(week.weekStart)}`}</span>
                    <span className="label">
                      {shortDate(week.weekStart).toUpperCase()} – {shortDate(addDays(week.weekStart, 6)).toUpperCase()}
                    </span>
                  </span>
                  <span className="counts">
                    <Status kind="done">{done} done</Status>
                    <Status kind="not_done">{notDone} not done</Status>
                    <Status kind="postponed">{postponed} postponed</Status>
                    {planned > 0 && <Status kind="upcoming">{planned} coming up</Status>}
                  </span>
                  <Icon name="chev-down" className="chev" />
                </summary>
                <div className="panel__body">
                  {week.counted.length > 0 && (
                    <div className="grid-2" style={{ gap: 10, marginBottom: 8 }}>
                      {week.counted.map((goal) => (
                        <div key={goal.goalId} className="meter" style={{ padding: "12px 14px" }}>
                          <CatIcon category={goal.category} size="sm" />
                          <div>
                            <p className="meter__title" style={{ fontSize: 16 }}>
                              {goal.title}{" "}
                              <span className="meter__count">
                                · {goal.done} of {goal.target} this {goal.period}
                              </span>
                            </p>
                            <div className="bar" role="progressbar" aria-label={goal.title} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={goal.done}>
                              <span style={{ width: `${Math.min(100, (goal.done / goal.target) * 100)}%` }} />
                            </div>
                          </div>
                          <span />
                        </div>
                      ))}
                    </div>
                  )}
                  {week.categories.map((group) => (
                    <div key={group.category} className="stack" style={{ gap: 8, marginTop: 20 }}>
                      <h3 className="cat-head label" style={{ margin: 0, fontSize: 14 }}>
                        <Icon name={categoryIcon(group.category)} className="icon--sm" />
                        {group.label.toUpperCase()}
                      </h3>
                      <ul className="rows" aria-label={`${group.label} sessions`}>
                        {group.items.map((item) => (
                          <li key={item.key}>
                            <span>
                              <span style={{ fontWeight: 500 }}>{item.title}</span> <span className="rows__sub">· {sessionSub(item)}</span>
                            </span>
                            <Status kind={item.status === "planned" ? "upcoming" : item.status}>{item.status === "postponed" ? "Postponed" : undefined}</Status>
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

        <div className="stack-48">
          <section className="stack" aria-labelledby="pw-h">
            <h2 id="pw-h" className="subhead">
              Patterns worth a chat
            </h2>
            <p className="muted small">These happened around the same time. They don&apos;t show that one caused the other.</p>
            {insights.hypotheses.length === 0 ? (
              <p className="muted">Nothing stands out right now.</p>
            ) : (
              insights.hypotheses.map((statement, index) => {
                const agent = agentIn(statement.basis);
                return (
                  <article key={index} className="card stack" style={{ gap: 12 }}>
                    <span className="tag tag--note" style={{ justifySelf: "start" }}>
                      <Icon name="info" className="icon--sm" />
                      NOT A CONCLUSION
                    </span>
                    <p>{statement.text}</p>
                    <p className="by">
                      {agent && <Avatar agent={agent} />}
                      {statement.basis}
                    </p>
                  </article>
                );
              })
            )}
          </section>

          <section className="stack" aria-labelledby="pc-h">
            <h2 id="pc-h" className="subhead">
              Plan changes you approved
            </h2>
            {insights.planChanges.length === 0 ? (
              <p className="muted">No changes in the last four weeks.</p>
            ) : (
              insights.planChanges.map((change) => (
                <article key={change.sources[0]} className="card stack" style={{ gap: 12 }}>
                  <p className="title">{change.text}</p>
                  <p className="quote">
                    {change.basis}
                    {change.quote ? `: “${change.quote}”` : ""}
                  </p>
                </article>
              ))
            )}
          </section>

          <div className="stack">
            <ButtonLink block href="/call?agent=natalie">
              <Icon name="mic" className="icon--sm" />
              Talk it through with Natalie
            </ButtonLink>
            <ButtonLink variant="ghost" block href="/care-sharing">
              Share a summary with your clinician
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
