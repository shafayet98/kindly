import type { RealtimeItem } from "@openai/agents/realtime";
import type { AgentKey } from "@/lib/agents/directory";

// Agents whose conversations are private by default. Crossing this boundary in either direction
// removes earlier conversation from the live model context.
const PRIVATE_AGENTS: ReadonlySet<AgentKey> = new Set(["sarah"]);

export function crossesPrivacyBoundary(from: AgentKey, to: AgentKey) {
  return PRIVATE_AGENTS.has(from) !== PRIVATE_AGENTS.has(to) || (PRIVATE_AGENTS.has(from) && from !== to);
}

/**
 * Keeps only what the next agent needs to continue: the person's latest message (their request
 * to switch) and the in-flight handoff call. Everything said or looked up before is dropped.
 */
export function pruneForHandoff(history: RealtimeItem[]): RealtimeItem[] {
  const lastUserMessage = history.findLast((item) => item.type === "message" && item.role === "user");
  const lastFunctionCall = history.findLast((item) => item.type === "function_call");
  const keep = new Set([lastUserMessage?.itemId, lastFunctionCall?.itemId].filter(Boolean));
  return history.filter((item) => keep.has(item.itemId));
}
