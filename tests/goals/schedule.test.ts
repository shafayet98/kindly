import { describe, expect, it } from "vitest";
import { describeGoalChange, describeSchedule, retitleForTime } from "@/lib/goals/describe";
import { guessCategory } from "@/lib/goals/categories";
import { buildItems, countProgress, hasFixedSessions, monthEnd, plannedSlots, type GoalPlan, type SessionRow } from "@/lib/goals/schedule";

const goal = (overrides: Partial<GoalPlan>): GoalPlan => ({
  id: "g",
  title: "Walk",
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
  ...overrides,
});
const row = (overrides: Partial<SessionRow>): SessionRow => ({
  goalId: "g",
  scheduledDate: "2026-11-02",
  slotTime: "08:00",
  status: "done",
  movedToDate: null,
  movedToTime: null,
  movedFromDate: null,
  movedFromTime: null,
  value: null,
  unit: null,
  note: null,
  ...overrides,
});

// Week of Mon 2 Nov 2026; "today" is Thu 5 Nov.
const WEEK = ["2026-11-02", "2026-11-08"] as const;
const TODAY = "2026-11-05";

describe("plannedSlots", () => {
  it("plans fixed weekly sessions on their days and times", () => {
    expect(plannedSlots(goal({}), ...WEEK)).toEqual([
      { date: "2026-11-02", slotTime: "08:00" },
      { date: "2026-11-04", slotTime: "08:00" },
      { date: "2026-11-06", slotTime: "08:00" },
    ]);
  });

  it("plans daily goals every day (or on chosen days), one slot per time", () => {
    const meds = goal({ cadence: "daily", daysOfWeek: null, times: ["20:00", "08:00"], targetCount: 2 });
    expect(plannedSlots(meds, "2026-11-02", "2026-11-03").map((s) => `${s.date} ${s.slotTime}`)).toEqual([
      "2026-11-02 08:00",
      "2026-11-02 20:00",
      "2026-11-03 08:00",
      "2026-11-03 20:00",
    ]);
    const weeknights = goal({ cadence: "daily", daysOfWeek: [1, 2, 3, 4, 5], times: [] });
    expect(plannedSlots(weeknights, ...WEEK)).toHaveLength(5);
  });

  it("respects the goal's start and end dates (versions)", () => {
    expect(plannedSlots(goal({ startsOn: "2026-11-04" }), ...WEEK)).toHaveLength(2);
    expect(plannedSlots(goal({ endsOn: "2026-11-03" }), ...WEEK)).toHaveLength(1);
  });

  it("treats flexible weekly and monthly goals as counted, not slotted", () => {
    expect(hasFixedSessions(goal({ daysOfWeek: null }))).toBe(false);
    expect(hasFixedSessions(goal({ cadence: "monthly", daysOfWeek: null }))).toBe(false);
    expect(plannedSlots(goal({ daysOfWeek: null }), ...WEEK)).toEqual([]);
  });
});

describe("buildItems", () => {
  it("marks done, not done (past) and planned (today onwards)", () => {
    const items = buildItems([goal({})], [row({})], ...WEEK, TODAY);
    expect(items.map((item) => [item.date, item.status])).toEqual([
      ["2026-11-02", "done"],
      ["2026-11-04", "not_done"],
      ["2026-11-06", "planned"],
    ]);
  });

  it("shows a postponed session on both days", () => {
    const rows = [
      row({ scheduledDate: "2026-11-04", status: "postponed", movedToDate: "2026-11-05", movedToTime: "17:00" }),
      row({ scheduledDate: "2026-11-05", slotTime: "17:00", status: "planned", movedFromDate: "2026-11-04", movedFromTime: "08:00" }),
    ];
    const items = buildItems([goal({})], rows, ...WEEK, TODAY);
    expect(items.map((item) => [item.date, item.time, item.status])).toEqual([
      ["2026-11-02", "08:00", "not_done"],
      ["2026-11-04", "08:00", "postponed"],
      ["2026-11-05", "17:00", "planned"],
      ["2026-11-06", "08:00", "planned"],
    ]);
    expect(items[2].movedFrom).toEqual({ date: "2026-11-04", time: "08:00" });
  });

  it("includes entries for flexible goals on the day they were done", () => {
    const pushups = goal({ id: "p", title: "30 push-ups", category: "workout", daysOfWeek: null, times: [], targetCount: 2 });
    const items = buildItems([pushups], [row({ goalId: "p", scheduledDate: "2026-11-03", slotTime: "extra:1", value: "30", unit: "reps" })], ...WEEK, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ date: "2026-11-03", status: "done", amount: "30 reps", time: null });
  });
});

describe("countProgress", () => {
  it("counts flexible weekly goals per week and monthly goals per month", () => {
    const pushups = goal({ id: "p", daysOfWeek: null, times: [], targetCount: 2 });
    const recipes = goal({ id: "r", cadence: "monthly", daysOfWeek: null, times: [], targetCount: 2 });
    const rows = [
      row({ goalId: "p", scheduledDate: "2026-11-03", slotTime: "extra:1" }),
      row({ goalId: "p", scheduledDate: "2026-10-30", slotTime: "extra:1" }), // previous week
      row({ goalId: "r", scheduledDate: "2026-11-01", slotTime: "extra:1" }),
      row({ goalId: "r", scheduledDate: "2026-10-20", slotTime: "extra:1" }), // previous month
    ];
    expect(countProgress([pushups, recipes, goal({})], rows, WEEK[0]).map((p) => [p.goalId, p.period, p.done, p.target])).toEqual([
      ["p", "week", 1, 2],
      ["r", "month", 1, 2],
    ]);
  });

  it("knows month lengths", () => {
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });
});

describe("descriptions", () => {
  it("describes schedules in plain words", () => {
    expect(describeSchedule(goal({}))).toBe("Mon, Wed, Fri · 8:00 AM · 20 min");
    expect(describeSchedule(goal({ daysOfWeek: null, times: [], durationMinutes: null }))).toBe("3 times a week, any days");
    expect(describeSchedule(goal({ cadence: "daily", daysOfWeek: [1, 2, 3, 4, 5], times: ["22:30"], durationMinutes: null }))).toBe("Weekdays · 10:30 PM");
    expect(describeSchedule(goal({ cadence: "monthly", targetCount: 2, daysOfWeek: null, times: [], durationMinutes: null }))).toBe("twice a month");
  });

  it("describes changes", () => {
    const before = goal({});
    expect(describeGoalChange(before, { ...before, daysOfWeek: [2, 4], targetCount: 2 })).toBe("Mon, Wed, Fri → Tue, Thu");
    expect(describeGoalChange(before, { ...before, times: ["17:00"] })).toBe("8:00 AM → 5:00 PM");
    expect(describeGoalChange(before, before)).toBe("");
  });

  it("keeps a time in the title in step", () => {
    expect(retitleForTime("In bed by 10:30 on weeknights", "22:30", "22:00")).toBe("In bed by 10:00 on weeknights");
    expect(retitleForTime("Sleep earlier", "22:30", "22:00")).toBe("Sleep earlier");
  });
});

describe("guessCategory", () => {
  it("picks sensible categories from plain words", () => {
    expect(guessCategory("Walk 3 days a week")).toBe("walk");
    expect(guessCategory("Do 30 push-ups")).toBe("workout");
    expect(guessCategory("Take my blood pressure tablets")).toBe("medication");
    expect(guessCategory("Drink 8 glasses of water")).toBe("food_drink");
    expect(guessCategory("Call my sister")).toBe("other");
  });
});
