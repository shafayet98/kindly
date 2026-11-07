import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readJson, requirePatientApi } from "@/lib/api/guard";
import { summarizeConversation, transcriptSchema } from "@/lib/conversations/summary";
import { endCallSession, getOwnedLiveSession, recordHandoff } from "@/lib/voice/sessions";

const agent = z.enum(["natalie", "milo", "sarah"]);
const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("handoff"), sessionId: z.uuid(), from: agent, to: agent, via: z.enum(["voice", "ui"]) }),
  // The transcript is only used to write a summary (if the person has summaries on), then discarded.
  z.object({ type: z.literal("end"), sessionId: z.uuid(), transcript: transcriptSchema.optional() }),
]);

// Records what happened in a browser session (handoffs, end). Structured facts only.
export async function POST(request: NextRequest) {
  const user = await requirePatientApi(request);
  if (user instanceof NextResponse) return user;

  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_request");

  const session = await getOwnedLiveSession(parsed.data.sessionId, user.id);
  if (!session) return jsonError(404, "session_not_found");

  if (parsed.data.type === "handoff") {
    await recordHandoff(session.id, user.id, parsed.data.from, parsed.data.to, parsed.data.via);
  } else {
    await endCallSession(session.id, user.id);
    const transcript = parsed.data.transcript;
    if (transcript?.length) after(() => summarizeConversation(user.id, session.id, transcript).then(() => undefined));
  }
  return new NextResponse(null, { status: 204 });
}
