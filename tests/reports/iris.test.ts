import { describe, expect, it } from "vitest";
import { buildItems, type GoalPlan, type SessionRow } from "@/lib/goals/schedule";
import { computeInsights, describeBasis, weekStartOf, type InsightEvent } from "@/lib/insights/iris";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "Australia/Adelaide";
const walk: GoalPlan = {
  id: "w",
  title: "Morning walk",
  category: "walk",
  cadence: "weekly",
  targetCount: 3,
  daysOfWeek: [1, 3, 5],
  times: ["08:00"],
  durationMinutes: 20,
  notes: null,
  startsOn: "2026-10-01",
  endsOn: null,
  status: "active",
};
const doneRow = (date: string): SessionRow => ({
  goalId: "w",
  scheduledDate: date,
  slotTime: "08:00",
  status: "done",
  movedToDate: null,
  movedToTime: null,
  movedFromDate: null,
  movedFromTime: null,
  value: null,
  unit: null,
  note: null,
});
const talk = { id: "s1", startedAt: zonedTimeToUtc("2026-10-28", "19:00", TZ) };
const mood: InsightEvent = {
  id: "m1",
  kind: "mood",
  value: null,
  unit: null,
  description: "Stressed after the roster change",
  occurredAt: zonedTimeToUtc("2026-10-28", "19:03", TZ),
  correctedFrom: null,
  sessionId: "s1",
  recordedByAgent: "natalie",
};

// Weeks of 26 Oct and 2 Nov; "today" is Thu 5 Nov. Only 30 Oct's walk was done in week one.
const FROM = "2026-10-26";
const TO = "2026-11-08";
const TODAY = "2026-11-05";
const items = buildItems([walk], [doneRow("2026-10-30"), doneRow("2026-11-02")], FROM, TO, TODAY);
const base = {
  items,
  counted: () => [],
  events: [mood],
  conversations: new Map([[talk.id, talk]]),
  from: FROM,
  to: TO,
  today: TODAY,
  timezone: TZ,
  planChanges: [
    { id: "p1", summary: "“Morning walk”: 30 min → 20 min", executedAt: zonedTimeToUtc("2026-11-01", "14:06", TZ), requestedByAgent: "natalie" as const, sessionId: "s1", reason: "my evening shifts changed" },
    { id: "p2", summary: "Added “30 push-ups”", executedAt: zonedTimeToUtc("2026-11-03", "09:00", TZ), requestedByAgent: null, sessionId: null, reason: null },
  ],
};

describe("computeInsights", () => {
  const insights = computeInsights(base);

  it("lists weeks newest first with done / not done / coming up, grouped by category", () => {
    expect(weekStartOf("2026-11-05")).toBe("2026-11-02");
    expect(insights.weeks.map((week) => [week.weekStart, week.totals])).toEqual([
      ["2026-11-02", { done: 1, notDone: 1, postponed: 0, planned: 1 }],
      ["2026-10-26", { done: 1, notDone: 2, postponed: 0, planned: 0 }],
    ]);
    expect(insights.weeks[1].categories[0]).toMatchObject({ category: "walk", label: "Walk" });
  });

  it("flags a pattern worth discussing, citing the conversation it came from, never as a cause", () => {
    expect(insights.hypotheses).toHaveLength(1);
    expect(insights.hypotheses[0].text).toContain("it doesn't show one caused the other");
    expect(insights.hypotheses[0].text).toContain("Stressed after the roster change");
    expect(insights.hypotheses[0].basis).toBe("Based on the conversation with Natalie on Wednesday 7:00 pm");
  });

  it("says where each plan change came from, with the person's own words", () => {
    expect(insights.planChanges[0]).toMatchObject({ basis: "You asked Natalie on Wednesday 7:00 pm", quote: "my evening shifts changed" });
    expect(insights.planChanges[1].basis).toBe("You changed this in the app on Tuesday 9:00 am");
  });

  it("uses neutral wording for clinicians", () => {
    const forClinician = computeInsights({ ...base, audience: "clinician" });
    expect(forClinician.planChanges[0].basis).toBe("The patient asked Natalie on Wednesday 7:00 pm");
    expect(forClinician.hypotheses[0].text).toContain("the patient mentioned how they were feeling");
  });

  it("totals sessions per goal without counting what's still to come", () => {
    expect(insights.goalStatements[0].text).toBe("“Morning walk”: 2 of 5 sessions done (as recorded by the person).");
  });
});

describe("describeBasis", () => {
  it("falls back to check-in dates when there was no conversation", () => {
    const checkIn = { occurredAt: zonedTimeToUtc("2026-11-03", "07:00", TZ), sessionId: null, recordedByAgent: null };
    expect(describeBasis([checkIn], new Map(), TZ)).toBe("Based on check-ins added on Tue 3 Nov");
  });

  it("summarises long runs of check-ins as a date range", () => {
    const many = ["2026-10-12", "2026-10-13", "2026-10-20", "2026-11-06"].map((date) => ({ occurredAt: zonedTimeToUtc(date, "07:00", TZ), sessionId: null, recordedByAgent: null }));
    expect(describeBasis(many, new Map(), TZ)).toBe("Based on check-ins added on 4 days between Mon 12 Oct and Fri 6 Nov");
  });
});
