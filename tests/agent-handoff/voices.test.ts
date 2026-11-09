import { describe, expect, it } from "vitest";
import { createVoiceAgent, VOICES, type CallOpening, type VoiceAgentKey } from "@/lib/agents/voice-agents";

const build = (agent: VoiceAgentKey, opening: CallOpening, met: boolean) =>
  createVoiceAgent({ agent, opening, familiarity: { personName: "Alex", met }, invoke: async () => ({ ok: true, result: {} }), onTransfer: async () => undefined });
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

  it("asks the person to hold before transferring", () => {
    expect(String(build("milo", { reason: "user_started" }, true).instructions)).toContain("One moment, I'll put you through");
  });
});

describe("greetings", () => {
  it("introduces the companion as an AI the first time only", () => {
    expect(opening(build("natalie", { reason: "user_started" }, false).instructions)).toContain("an AI companion");
    const returning = opening(build("natalie", { reason: "user_started" }, true).instructions);
    expect(returning).toContain("don't introduce yourself");
    expect(returning).toContain("Hi Alex, how can I help?");
  });

  it("still says who's calling on a phone call, briefly", () => {
    const returning = opening(build("milo", { reason: "reminder_call", reminderTitle: "Morning walk" }, true).instructions);
    expect(returning).toContain("Hi Alex, it's Milo from Kindly.");
    expect(returning).not.toContain("an AI assistant");
  });

  it("after a transfer, picks up the request with the briefing", () => {
    const transferred = opening(build("sarah", { reason: "transferred", from: "natalie", briefing: "What they want from you: talk about stress." }, true).instructions);
    expect(transferred).toContain("put through from Natalie");
    expect(transferred).toContain("talk about stress");
    expect(transferred).toContain("Hi Alex, Sarah here.");
  });
});
