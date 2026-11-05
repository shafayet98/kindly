import { randomBytes, timingSafeEqual } from "node:crypto";

// One-time tokens that bind an outbound call to the media stream Twilio opens for it.
// In memory: a token only has to survive from dialling to pickup on the same server process.

type Purpose = "call" | "stream";
type TokenRecord = { purpose: Purpose; expiresAt: number; data: Record<string, unknown> };

const tokens = new Map<string, TokenRecord>();

export function issueToken(purpose: Purpose, ttlMs: number, data: Record<string, unknown> = {}) {
  const token = randomBytes(24).toString("base64url");
  tokens.set(token, { purpose, expiresAt: Date.now() + ttlMs, data });
  return token;
}

/** Attaches data to a token that already exists (e.g. the CallSid Twilio returns after dialling). */
export function bindToken(token: string, data: Record<string, unknown>) {
  const record = tokens.get(token);
  if (record) record.data = { ...record.data, ...data };
}

/** Validates and consumes a token. Returns its data, or null if unknown, expired or the wrong purpose. */
export function consumeToken(token: string | undefined, purpose: Purpose) {
  if (!token) return null;
  for (const [stored, record] of tokens) {
    if (record.expiresAt < Date.now()) {
      tokens.delete(stored);
      continue;
    }
    if (stored.length === token.length && timingSafeEqual(Buffer.from(stored), Buffer.from(token))) {
      tokens.delete(stored);
      return record.purpose === purpose ? record.data : null;
    }
  }
  return null;
}
