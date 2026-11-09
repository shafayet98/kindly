import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readJson, requirePatientApi } from "@/lib/api/guard";
import { summarizeConversation, transcriptSchema } from "@/lib/conversations/summary";
import { endCallSession, getOwnedLiveSession } from "@/lib/voice/sessions";

// The transcript is only used to write a summary (if the person has summaries on), then discarded.
const body = z.object({ type: z.literal("end"), sessionId: z.uuid(), transcript: transcriptSchema.optional() });

// Records the end of a browser session. Handoffs are recorded when the next companion's secret is
// issued (/api/voice/session). Structured facts only.
export async function POST(request: NextRequest) {
  const user = await requirePatientApi(request);
  if (user instanceof NextResponse) return user;

  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_request");

  const session = await getOwnedLiveSession(parsed.data.sessionId, user.id);
  if (!session) return jsonError(404, "session_not_found");

  await endCallSession(session.id, user.id);
  const transcript = parsed.data.transcript;
  if (transcript?.length) after(() => summarizeConversation(user.id, session.id, transcript).then(() => undefined));
  return new NextResponse(null, { status: 204 });
}
