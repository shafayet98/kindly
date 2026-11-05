import { config } from "dotenv";
import { z } from "zod";

config({ path: ".env", quiet: true });

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "must be E.164, e.g. +61412345678");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REALTIME_PORT: z.coerce.number().int().positive().default(8787),
  // Public HTTPS origin Twilio can reach (tunnel in development), no trailing slash.
  PUBLIC_BASE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  OPENAI_API_KEY: z.string().min(1),
  REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC"),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: e164,
  DEMO_CALL_TO_NUMBER: e164,
  // Guards development-only endpoints such as "call my phone now".
  DEV_ADMIN_TOKEN: z.string().min(24),
  // The call scheduler only runs when explicitly enabled, so starting a server never dials by surprise.
  SCHEDULER_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  // Service-wide cap on calls placed per hour (cost control).
  CALLS_MAX_PER_HOUR: z.coerce.number().int().min(1).max(500).default(20),
  // Hard cap on any single outbound call, in seconds (cost control).
  CALL_MAX_DURATION_SECONDS: z.coerce.number().int().min(30).max(1800).default(300),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
