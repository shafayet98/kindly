import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";

// Voice session bookkeeping shared by the browser API and the phone server. Stores structured
// facts (which agent, which tool, outcome), never transcripts or audio.

export const MAX_SESSION_MINUTES = 15;

export async function createCallSession(input: {
  userId: string;
  channel: "browser" | "phone";
  activeAgent: AgentKey;
  twilioCallSid?: string;
  callJobId?: string;
}) {
  const [session] = await db
    .insert(schema.callSessions)
    .values({ ...input, state: "active" })
    .returning({ id: schema.callSessions.id });
  await recordAgentEvent({ sessionId: session.id, userId: input.userId, agent: input.activeAgent, eventType: "session_started", payload: { channel: input.channel } });
  return session.id;
}

/** A live session that belongs to the user, or null. Used to authorise every browser tool call. */
export async function getOwnedLiveSession(sessionId: string, userId: string) {
  const [session] = await db
    .select({ id: schema.callSessions.id, activeAgent: schema.callSessions.activeAgent, channel: schema.callSessions.channel })
    .from(schema.callSessions)
    .where(
      and(
        eq(schema.callSessions.id, sessionId),
        eq(schema.callSessions.userId, userId),
        ne(schema.callSessions.state, "ended"),
        gt(schema.callSessions.startedAt, sql`now() - make_interval(mins => ${MAX_SESSION_MINUTES})`),
      ),
    );
  return session ?? null;
}

export async function recordHandoff(sessionId: string, userId: string, from: AgentKey, to: AgentKey, via: "voice" | "ui") {
  await db.update(schema.callSessions).set({ activeAgent: to }).where(and(eq(schema.callSessions.id, sessionId), eq(schema.callSessions.userId, userId)));
  await recordAgentEvent({ sessionId, userId, agent: to, eventType: "handoff", payload: { from, to, via } });
  await audit({ actorUserId: userId, actorType: "agent", actorLabel: to, resourceType: "call_session", resourceId: sessionId, action: "agent.handoff", result: "success", metadata: { from, to, via } });
}

export async function endCallSession(sessionId: string, userId: string) {
  const ended = await db
    .update(schema.callSessions)
    .set({ state: "ended", endedAt: new Date() })
    .where(and(eq(schema.callSessions.id, sessionId), eq(schema.callSessions.userId, userId), ne(schema.callSessions.state, "ended")))
    .returning({ activeAgent: schema.callSessions.activeAgent });
  if (ended[0]) await recordAgentEvent({ sessionId, userId, agent: ended[0].activeAgent, eventType: "session_ended", payload: {} });
}

export async function recordAgentEvent(input: {
  sessionId: string | null;
  userId: string;
  agent: AgentKey;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  await db.insert(schema.agentEvents).values({
    sessionId: input.sessionId,
    userId: input.userId,
    agent: input.agent,
    eventType: input.eventType,
    structuredPayload: input.payload,
  });
}

/** Sessions started by this user in the last hour (cost control for browser calls). */
export async function countRecentSessions(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.callSessions)
    .where(and(eq(schema.callSessions.userId, userId), gt(schema.callSessions.startedAt, sql`now() - interval '1 hour'`)));
  return row?.count ?? 0;
}

/**
 * What a companion should know before greeting someone: the name they asked to be called, and
 * which companions they've spoken with before (they introduce themselves only the first time).
 */
export async function callerContext(userId: string, currentSessionId: string | null) {
  const [profile] = await db
    .select({ nickname: schema.patientProfiles.nickname, displayName: schema.users.displayName })
    .from(schema.users)
    .leftJoin(schema.patientProfiles, eq(schema.patientProfiles.userId, schema.users.id))
    .where(eq(schema.users.id, userId));
  const events = await db
    .selectDistinct({ agent: schema.agentEvents.agent })
    .from(schema.agentEvents)
    .where(
      and(
        eq(schema.agentEvents.userId, userId),
        inArray(schema.agentEvents.eventType, ["session_started", "handoff"]),
        currentSessionId ? sql`${schema.agentEvents.sessionId} is distinct from ${currentSessionId}` : undefined,
      ),
    );
  const name = (profile?.nickname ?? profile?.displayName?.split(" ")[0] ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 40);
  return { personName: name || null, met: events.map((event) => event.agent) as AgentKey[] };
}
