import { randomBytes, timingSafeEqual } from "node:crypto";

// One-time tokens that bind an outbound call to the media stream Twilio opens for it.
// In-memory for the spike; moves to the database with durable call jobs.

type TokenRecord = { purpose: "call" | "stream"; expiresAt: number; data: Record<string, string> };

const tokens = new Map<string, TokenRecord>();

export function issueToken(purpose: TokenRecord["purpose"], ttlMs: number, data: Record<string, string> = {}) {
  const token = randomBytes(24).toString("base64url");
  tokens.set(token, { purpose, expiresAt: Date.now() + ttlMs, data });
  return token;
}

/** Attaches data to a token that already exists (e.g. the CallSid Twilio returns after dialling). */
export function bindToken(token: string, data: Record<string, string>) {
  const record = tokens.get(token);
  if (record) record.data = { ...record.data, ...data };
}

/** Validates and consumes a token. Returns its data, or null if unknown, expired or the wrong purpose. */
export function consumeToken(token: string | undefined, purpose: TokenRecord["purpose"]) {
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
