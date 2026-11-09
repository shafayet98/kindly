import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { VOICE_AGENT_KEYS, VOICES, type VoiceAgentKey } from "@/lib/agents/voice-agents";
import { jsonError, readJson, requirePatientApi } from "@/lib/api/guard";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { callerContext, countRecentSessions, createCallSession, getOwnedLiveSession, recordHandoff } from "@/lib/voice/sessions";

const MAX_SESSIONS_PER_HOUR = 6;
// Each companion joins with a new client secret; this caps how many one call can mint.
const MAX_HANDOFFS_PER_CALL = 12;
const model = process.env.REALTIME_MODEL ?? "gpt-realtime-2.1";

const body = z.object({
  agent: z.enum(VOICE_AGENT_KEYS as ["milo", "natalie", "sarah"]).default("natalie"),
  topic: z.enum(["unwell", "plan"]).nullish(),
  // Set when the person is being put through to another companion in a call that's already live.
  continueSessionId: z.uuid().optional(),
  via: z.enum(["voice", "ui"]).default("voice"),
});

// Starts a browser voice session, or the next companion's part of one: records it, then issues a
// short-lived OpenAI client secret in that companion's voice so the browser can connect directly.
// The real API key never leaves the server.
export async function POST(request: NextRequest) {
  const user = await requirePatientApi(request);
  if (user instanceof NextResponse) return user;

  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_request");
  const { agent, topic, continueSessionId, via } = parsed.data;

  const consents = await getConsentState(user.id);
  if (!consents.browser_voice) return jsonError(403, "consent_required");

  let sessionId: string;
  if (continueSessionId) {
    const live = await getOwnedLiveSession(continueSessionId, user.id);
    if (!live || live.channel !== "browser") return jsonError(404, "session_not_found");
    if (live.activeAgent === agent) return jsonError(400, "invalid_request");
    const [handoffs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.agentEvents)
      .where(and(eq(schema.agentEvents.sessionId, live.id), eq(schema.agentEvents.eventType, "handoff")));
    if ((handoffs?.count ?? 0) >= MAX_HANDOFFS_PER_CALL) return jsonError(429, "rate_limited");
    // Recorded here, with the secret, so every companion that joins is counted and shown in the call's history.
    await recordHandoff(live.id, user.id, live.activeAgent, agent, via);
    sessionId = live.id;
  } else {
    if ((await countRecentSessions(user.id)) >= MAX_SESSIONS_PER_HOUR) return jsonError(429, "rate_limited");
    sessionId = await createCallSession({ userId: user.id, channel: "browser", activeAgent: agent });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const [secret, context] = await Promise.all([
      openai.realtime.clientSecrets.create({
        // Only long enough to connect; the secret can't be reused afterwards.
        expires_after: { anchor: "created_at", seconds: 60 },
        session: { type: "realtime", model, audio: { output: { voice: VOICES[agent] } } },
      }),
      continueSessionId ? null : callerContext(user.id, sessionId),
    ]);
    return NextResponse.json(
      {
        sessionId,
        clientSecret: secret.value,
        model,
        startAgent: agent,
        topic: topic ?? null,
        ...(context && { personName: context.personName, met: context.met.filter((key): key is VoiceAgentKey => VOICE_AGENT_KEYS.includes(key as VoiceAgentKey)) }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("client secret failed", error instanceof Error ? error.message : "unknown");
    return jsonError(502, "voice_unavailable");
  }
}
