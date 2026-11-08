import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { recordAgentEvent } from "@/lib/voice/sessions";
import { handlers } from "./handlers";
import { isToolName, TOOL_SPECS } from "./specs";
import type { ToolContext } from "./types";

export type ToolOutcome = { ok: true; result: Record<string, unknown> } | { ok: false; error: string };

/**
 * The single entry point for agent tool calls, from the phone server and the browser API alike.
 * Enforces the agent allowlist and input schema server-side, and logs the outcome (not content).
 */
export async function runTool(ctx: ToolContext, name: unknown, rawInput: unknown): Promise<ToolOutcome> {
  if (!isToolName(name)) return { ok: false, error: "Unknown tool." };
  const toolSpec = TOOL_SPECS[name];

  if (!(toolSpec.agents as readonly AgentKey[]).includes(ctx.agent)) {
    await audit({ actorUserId: ctx.userId, actorType: "agent", actorLabel: ctx.agent, resourceType: "tool", resourceId: name, action: "tool.call", result: "denied" });
    return { ok: false, error: `${name} is not available to this companion.` };
  }

  const input = toolSpec.parameters.safeParse(rawInput ?? {});
  if (!input.success) return { ok: false, error: "Invalid input for this tool." };

  try {
    const handler = handlers[name] as (context: ToolContext, value: unknown) => Promise<Record<string, unknown>>;
    const result = await handler(ctx, input.data);
    await recordAgentEvent({ sessionId: ctx.sessionId, userId: ctx.userId, agent: ctx.agent, eventType: "tool_call", payload: { tool: name, ok: !("error" in result) } });
    return { ok: true, result };
  } catch (error) {
    await recordAgentEvent({ sessionId: ctx.sessionId, userId: ctx.userId, agent: ctx.agent, eventType: "tool_call", payload: { tool: name, ok: false } });
    console.error(`tool ${name} failed`, error instanceof Error ? error.message : error);
    return { ok: false, error: "That didn't work. Nothing was changed." };
  }
}
