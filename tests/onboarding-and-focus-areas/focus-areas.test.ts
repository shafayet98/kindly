import { describe, expect, it } from "vitest";
import { normalizeFocusAreas } from "@/lib/preferences/focus-areas";
import { goalSuggestions, rankQuickActions, suggestedAgents } from "@/lib/preferences/suggestions";

describe("normalizeFocusAreas", () => {
  it("keeps several valid areas in canonical order and drops unknown or duplicate keys", () => {
    expect(normalizeFocusAreas(["emotional_wellbeing", "health_habits", "admin", "health_habits", 42])).toEqual([
      "health_habits",
      "emotional_wellbeing",
    ]);
  });

  it("allows zero selections (skip)", () => {
    expect(normalizeFocusAreas([])).toEqual([]);
  });
});

describe("dashboard suggestions", () => {
  it("never hides quick actions; selected areas only move them first (AC-22, AC-23)", () => {
    const neutral = rankQuickActions([]);
    const ranked = rankQuickActions(["emotional_wellbeing"]);
    expect(ranked).toHaveLength(neutral.length);
    expect(ranked[0].key).toBe("feelings");
    // "I'm feeling unwell" stays available without selecting that area.
    expect(ranked.map((action) => action.key)).toContain("unwell");
  });

  it("suggests matching companions first but keeps all live companions", () => {
    expect(suggestedAgents(["emotional_wellbeing"])).toEqual(["sarah", "natalie", "milo"]);
    expect(suggestedAgents([])).toEqual(["natalie", "milo", "sarah"]);
  });

  it("offers at most three goal ideas and a sensible default with no areas", () => {
    expect(goalSuggestions([]).map((goal) => goal.title)).toEqual(["Walk three times a week"]);
    expect(goalSuggestions(["health_habits", "daily_planning", "emotional_wellbeing"]).length).toBeLessThanOrEqual(3);
  });
});
