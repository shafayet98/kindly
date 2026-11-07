import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { openai, TEXT_MODEL } from "@/lib/ai/client";
import { GOAL_CATEGORY_KEYS, guessCategory } from "./categories";
import { goalInputSchema, normaliseGoal, type GoalInput } from "./service";

// Turns what someone types ("walk 3 days a week", "30 push-ups") into a goal draft they can check
// before saving. The model only fills a fixed schema; the result is validated like any input.

const draftSchema = z.object({
  title: z.string(),
  category: z.enum(GOAL_CATEGORY_KEYS),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  target_count: z.number().int(),
  days_of_week: z.array(z.number().int()).nullable(),
  times: z.array(z.string()),
  duration_minutes: z.number().int().nullable(),
  notes: z.string().nullable(),
});

const INSTRUCTIONS = `You turn a person's health or wellbeing goal into a structured plan for a habit app.
Return only what they said or clearly implied; never invent details.
- title: short and friendly, in their words, e.g. "Walk", "30 push-ups", "Take blood pressure tablets", "In bed by 10:30".
- category: walk (walking, steps, hikes), workout (push-ups, gym, running, yoga, stretching, any exercise that isn't walking),
  medication (taking any medicine, tablets, inhaler, vitamins), sleep (bedtime, waking, naps), food_drink (eating, water,
  alcohol, cooking), smoking (smoking or vaping less), mindfulness (meditation, breathing, journaling), other.
- cadence: daily (every day or on set days each week, one target per day), weekly (N times a week), monthly (N times a month).
- target_count: how many SESSIONS per day/week/month. "3 days a week" = weekly 3. "Every day" = daily 1.
  Amounts inside one session are not sessions: "30 push-ups" or "8 glasses of water a day" is 1 session (keep the amount
  in the title). If they didn't say how often, use daily with target_count 1.
- days_of_week: specific days only if they named them (0 = Sunday ... 6 = Saturday); "weekdays" = [1,2,3,4,5]; otherwise null.
- times: 24-hour "HH:MM" only if they gave a time; "twice a day at 8 and 8" = ["08:00","20:00"]; otherwise [].
- duration_minutes: only if they said how long.
- notes: anything else useful they said (e.g. "as prescribed", "with my neighbour"), else null.
Medication: record the schedule only. Never add or change doses, and never give medical advice.`;

function fallback(text: string): GoalInput {
  const count = Number(text.match(/\b(\d{1,2})\s*(?:days?|times?)\b/i)?.[1] ?? 1);
  const monthly = /\bmonth/i.test(text);
  const daily = /\b(every ?day|daily|each day)\b/i.test(text);
  return normaliseGoal({
    title: text.trim().slice(0, 80),
    category: guessCategory(text),
    cadence: monthly ? "monthly" : daily ? "daily" : "weekly",
    targetCount: Math.min(Math.max(count, 1), 50),
    daysOfWeek: null,
    times: [],
    durationMinutes: null,
    notes: null,
  });
}

export async function parseGoal(text: string): Promise<{ draft: GoalInput; usedAi: boolean }> {
  const input = text.trim().slice(0, 300);
  try {
    const response = await openai().responses.parse({
      model: TEXT_MODEL,
      instructions: INSTRUCTIONS,
      input,
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(draftSchema, "goal_draft") },
    });
    const parsed = response.output_parsed;
    if (!parsed) return { draft: fallback(input), usedAi: false };
    const candidate = goalInputSchema.safeParse({
      title: parsed.title,
      category: parsed.category,
      cadence: parsed.cadence,
      targetCount: Math.min(Math.max(parsed.target_count, 1), 50),
      daysOfWeek: parsed.days_of_week?.filter((day) => day >= 0 && day <= 6) ?? null,
      times: parsed.times.filter((time) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)),
      durationMinutes: parsed.duration_minutes && parsed.duration_minutes > 0 ? Math.min(parsed.duration_minutes, 600) : null,
      notes: parsed.notes?.slice(0, 300) ?? null,
    });
    return candidate.success ? { draft: normaliseGoal(candidate.data), usedAi: true } : { draft: fallback(input), usedAi: false };
  } catch (error) {
    console.warn("goal parse fell back to rules:", error instanceof Error ? error.message : "unknown");
    return { draft: fallback(input), usedAi: false };
  }
}
