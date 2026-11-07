import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AddGoal } from "@/components/goals/add-goal";
import { WeekCalendar, WeekNav, WeekRange } from "@/components/goals/week-calendar";
import { AiTag, Avatar, Icon, PanelSummary } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
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
  const todayLabel = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${calendar.today}T00:00:00Z`));
  const showWeek = anyGoals || calendar.items.length > 0;

  return (
    <div className="stack-48">
      <div className="stack" style={{ gap: 8 }}>
        <p className="label">{todayLabel}</p>
        <h1 className="headline">{name ? `Hi ${name}` : "Hi there"}. How can we help today?</h1>
      </div>

      <section aria-label="Main actions" className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Link className="talk-card" href="/call?agent=natalie">
          <div>
            <p className="headline" style={{ fontSize: 48 }}>
              Talk now
            </p>
            <p className="body-lg" style={{ marginTop: 8 }}>
              Start with Natalie, or ask for anyone
            </p>
            <div className="talk-card__faces" aria-hidden="true">
              <Avatar agent="natalie" size="sm" />
              <Avatar agent="milo" size="sm" />
              <Avatar agent="sarah" size="sm" />
            </div>
          </div>
          <span className="talk-card__mic" aria-hidden="true">
            <Icon name="mic" className="icon--xl" />
          </span>
        </Link>
        <Link className="prog-card" href="/progress">
          <span className="cat-icon">
            <Icon name="chart" />
          </span>
          <div>
            <p className="subhead">Progress</p>
            <p className="muted" style={{ marginTop: 6 }}>
              See what you&apos;ve done, week by week
            </p>
          </div>
          <span className="arrow-link">
            Open progress <Icon name="arrow-right" className="icon--sm" />
          </span>
        </Link>
      </section>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="stack-24" aria-labelledby="week-h">
          <div className="section-head" style={{ margin: 0, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 id="week-h" className="subhead">
                Your week
              </h2>
              {showWeek && <WeekRange weekStart={calendar.weekStart} />}
            </div>
            <div className="row" style={{ gap: 16 }}>
              {showWeek && <WeekNav prevHref={calendar.prevHref} nextHref={calendar.nextHref} thisWeekHref={calendar.thisWeekHref} />}
              <Link className="link" href="/goals">
                Manage goals
              </Link>
            </div>
          </div>
          {showWeek ? (
            <WeekCalendar
              weekStart={calendar.weekStart}
              today={calendar.today}
              items={calendar.items}
              counted={calendar.counted}
              reminders={calendar.reminders}
              goalInfo={calendar.goalInfo}
            />
          ) : (
            <div className="empty">
              <span className="empty__art">
                <Icon name="calendar" className="icon--xl" />
              </span>
              <p className="title">No goals yet</p>
              <p className="muted" style={{ maxWidth: 440 }}>
                Add one below, or just tell Natalie what you&apos;d like to do. It&apos;ll show up here, day by day.
              </p>
              <ButtonLink variant="ghost" href="/call?agent=natalie">
                <Icon name="mic" className="icon--sm" />
                Tell Natalie instead
              </ButtonLink>
            </div>
          )}
          <details className="panel" open={!anyGoals}>
            <PanelSummary icon="plus" accent>
              Add a goal
            </PanelSummary>
            <div className="panel__body">
              <AddGoal phoneCallsOn={phoneCallsOn} idPrefix="home" />
            </div>
          </details>
        </section>

        <aside className="stack-24" aria-labelledby="comp-h">
          <h2 id="comp-h" className="subhead">
            Your companions
          </h2>
          <ul className="stack">
            {COMPANIONS.map((key) => (
              <li key={key} className="card companion-card" style={{ padding: 20 }}>
                <div className="companion">
                  <Avatar agent={key} />
                  <div>
                    <p className="companion__name">
                      {AGENTS[key].name} <AiTag />
                    </p>
                    <p className="companion__role">{AGENTS[key].role}</p>
                  </div>
                </div>
                <p className="muted small">{AGENTS[key].helpsWith}</p>
                <ButtonLink variant="ghost" size="sm" href={`/call?agent=${key}`} style={{ alignSelf: "flex-start" }}>
                  <Icon name="mic" className="icon--sm" />
                  Talk to {AGENTS[key].name}
                </ButtonLink>
              </li>
            ))}
          </ul>
          <Link className="card row nowrap" href="/agents" style={{ textDecoration: "none", padding: "16px 20px" }}>
            <Icon name="users" />
            <span style={{ fontWeight: 500 }}>Meet the whole team</span>
            <Icon name="chev-right" className="icon--sm" />
          </Link>
          <Link className="card card--soft row nowrap" href="/check-in/unwell" style={{ textDecoration: "none", padding: "16px 20px" }}>
            <Icon name="heart" />
            <span>
              <span style={{ fontWeight: 500, display: "block" }}>Feeling unwell?</span>
              <span className="small muted">What to do and where to get help</span>
            </span>
            <Icon name="chev-right" className="icon--sm" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
