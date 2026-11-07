import OpenAI from "openai";

// Small, fast text model for structured extraction and short summaries.
export const TEXT_MODEL = process.env.TEXT_MODEL ?? "gpt-5.4-mini";

let client: OpenAI | null = null;
export function openai() {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
  return client;
}
