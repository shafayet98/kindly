import { describe, expect, it } from "vitest";
import { createVoiceAgent, VOICES, type CallOpening, type VoiceAgentKey } from "@/lib/agents/voice-agents";

const build = (agent: VoiceAgentKey, opening: CallOpening, met: boolean | VoiceAgentKey[]) =>
  createVoiceAgent({
    agent,
    opening,
    familiarity: { personName: "Alex", met: Array.isArray(met) ? met : met ? [agent] : [] },
    invoke: async () => ({ ok: true, result: {} }),
    onTransfer: async () => undefined,
  });
const opening = (instructions: unknown) => String(instructions).split("CALL OPENING:")[1];

describe("companion voices", () => {
  it("gives each companion its own voice", () => {
    expect(new Set(Object.values(VOICES)).size).toBe(3);
    expect(build("sarah", { reason: "user_started" }, false).voice).toBe(VOICES.sarah);
  });

  it("can transfer to each other companion, not to itself", () => {
    const names = build("natalie", { reason: "user_started" }, true).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["transfer_to_milo", "transfer_to_sarah"]));
    expect(names).not.toContain("transfer_to_natalie");
  });

  it("lets the person know who's coming before transferring, in its own words", () => {
    const rules = String(build("milo", { reason: "user_started" }, true).instructions);
    expect(rules).toContain("one short sentence in your own words");
    expect(rules).toContain("Don't use a stock phrase");
  });
});

describe("transfers", () => {
  it("explains only companions the person hasn't met", () => {
    const rules = String(build("natalie", { reason: "user_started" }, ["natalie", "milo"]).instructions);
    expect(rules).toContain("- Milo (Reminders & calls): they've met before");
    expect(rules).toContain("- Sarah (Wellbeing companion): they haven't met yet");
  });
});

describe("greetings", () => {
  it("introduces the companion as an AI the first time only", () => {
    expect(opening(build("natalie", { reason: "user_started" }, false).instructions)).toContain("an AI companion");
    const returning = opening(build("natalie", { reason: "user_started" }, true).instructions);
    expect(returning).toContain("don't introduce yourself");
    expect(returning).toContain("They like to be called Alex");
    expect(returning).toContain("in your own words");
  });

  it("still says who's calling on a phone call, briefly", () => {
    const returning = opening(build("milo", { reason: "reminder_call", reminderTitle: "Morning walk" }, true).instructions);
    expect(returning).toContain("say your name and that you're calling from Kindly");
    expect(returning).not.toContain("an AI assistant");
  });

  it("after a transfer, picks up the request with the briefing", () => {
    const transferred = opening(build("sarah", { reason: "transferred", from: "natalie", briefing: "What they want from you: talk about stress." }, true).instructions);
    expect(transferred).toContain("put through from Natalie");
    expect(transferred).toContain("talk about stress");
    expect(transferred).toContain("say your name as you greet them");
    expect(transferred).toContain("don't introduce yourself");
  });
});
