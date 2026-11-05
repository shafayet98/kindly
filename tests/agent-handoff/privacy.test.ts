import type { RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it } from "vitest";
import { crossesPrivacyBoundary, pruneForHandoff } from "@/lib/voice/privacy";

const message = (itemId: string, role: "user" | "assistant", text: string) =>
  ({ itemId, type: "message", role, status: "completed", content: [{ type: "input_text", text }] }) as unknown as RealtimeItem;
const call = (itemId: string, name: string, output: string | null) =>
  ({ itemId, type: "function_call", name, arguments: "{}", output, status: output ? "completed" : "in_progress" }) as unknown as RealtimeItem;

describe("crossesPrivacyBoundary (AC-05, AC-06)", () => {
  it("is true into or out of Sarah and false between Milo and Natalie", () => {
    expect(crossesPrivacyBoundary("natalie", "sarah")).toBe(true);
    expect(crossesPrivacyBoundary("sarah", "natalie")).toBe(true);
    expect(crossesPrivacyBoundary("milo", "natalie")).toBe(false);
  });
});

describe("pruneForHandoff", () => {
  it("drops earlier conversation and tool results, keeping only the switch request and the handoff call", () => {
    const history = [
      message("1", "user", "I feel awful about my week"),
      message("2", "assistant", "That sounds hard"),
      call("3", "save_wellbeing_note", '{"saved":true}'),
      message("4", "user", "Can I talk to Natalie?"),
      call("5", "transfer_to_natalie", null),
    ];
    expect(pruneForHandoff(history).map((item) => item.itemId)).toEqual(["4", "5"]);
  });
});
