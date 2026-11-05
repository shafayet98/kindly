import { describe, expect, it } from "vitest";
import { computeInsights, weekStartOf, type InsightEvent } from "@/lib/insights/iris";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "Australia/Adelaide";
let n = 0;
const event = (date: string, kind: InsightEvent["kind"], extra: Partial<InsightEvent> = {}): InsightEvent => ({
  id: `e${++n}`,
  kind,
  goalId: null,
  value: null,
  unit: null,
  description: null,
  occurredAt: zonedTimeToUtc(date, "08:00", TZ),
  correctedFrom: null,
  ...extra,
});
const walkGoal = { id: "g1", title: "Walk three times a week", type: "activity", target: { timesPerWeek: 3 } };

describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf("2026-11-05")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
  });
});

describe("computeInsights", () => {
  const events = [
    // Week of 26 Oct: 3 walks, normal sleep.
    event("2026-10-26", "activity", { goalId: "g1", value: 20 }),
    event("2026-10-28", "activity", { goalId: "g1", value: 25 }),
    event("2026-10-30", "activity", { goalId: "g1", value: 20 }),
    event("2026-10-27", "sleep", { value: 7.5 }),
    // Week of 2 Nov: 1 walk, short sleep, a mood note.
    event("2026-11-06", "activity", { goalId: "g1", value: 20, correctedFrom: "old" }),
    event("2026-11-03", "sleep", { value: 5 }),
    event("2026-11-04", "sleep", { value: 5.5 }),
    event("2026-11-04", "mood", { description: "stressed" }),
  ];
  const insights = computeInsights({ events, goals: [walkGoal], planChanges: [], from: "2026-10-26", to: "2026-11-08", timezone: TZ });

  it("reports weekly goal counts against the person's target, with sources (AC-10)", () => {
    expect(insights.goals[0].weeks.map((week) => [week.weekStart, week.count, week.met])).toEqual([
      ["2026-10-26", 3, true],
      ["2026-11-02", 1, false],
    ]);
    expect(insights.goals[0].statement.text).toContain("1 of 2 weeks");
    expect(insights.goals[0].statement.sources).toHaveLength(4);
  });

  it("labels co-occurring reports as hypotheses, never causes", () => {
    expect(insights.hypotheses).toHaveLength(2);
    expect(insights.hypotheses[0].text).toContain("does not show one caused the other");
    expect(insights.hypotheses.every((h) => h.sources.length > 0)).toBe(true);
  });

  it("uses corrected values and says so (AC-08)", () => {
    expect(insights.observations.some((o) => o.text.includes("corrected"))).toBe(true);
  });

  it("marks missing days as unknown, not zero", () => {
    expect(insights.missingData[0].text).toBe("No check-ins on 7 of 14 days. Missing days are unknown, not zero.");
  });

  it("never invents numbers from free-text reports (AC-07)", () => {
    const vague = computeInsights({ events: [event("2026-11-02", "food", { description: "a big lunch" })], goals: [], planChanges: [], from: "2026-11-02", to: "2026-11-02", timezone: TZ });
    expect(JSON.stringify(vague)).not.toMatch(/calorie|kcal/i);
    expect(vague.observations).toHaveLength(0);
  });
});
