// Goal categories. Chosen automatically from what the person says; they can change it.

export const GOAL_CATEGORY_KEYS = ["walk", "workout", "medication", "sleep", "food_drink", "smoking", "mindfulness", "other"] as const;
export type GoalCategory = (typeof GOAL_CATEGORY_KEYS)[number];

export const GOAL_CATEGORIES: Record<GoalCategory, { label: string; icon: string; chip: string }> = {
  walk: { label: "Walk", icon: "🚶", chip: "bg-[#e3f0ee] text-[#185a54]" },
  workout: { label: "Workout", icon: "💪", chip: "bg-[#fbeae2] text-[#8a3b1c]" },
  medication: { label: "Medication", icon: "💊", chip: "bg-[#e8eefb] text-[#1f4b99]" },
  sleep: { label: "Sleep", icon: "🌙", chip: "bg-[#ece9f6] text-[#4b3f8a]" },
  food_drink: { label: "Food & drink", icon: "🥗", chip: "bg-[#eef6e2] text-[#3f6212]" },
  smoking: { label: "Smoking", icon: "🚭", chip: "bg-[#f3eee7] text-[#6b4f2a]" },
  mindfulness: { label: "Mindfulness", icon: "🧘", chip: "bg-[#f6e9f1] text-[#8a2f63]" },
  other: { label: "Other", icon: "⭐", chip: "bg-[#efefef] text-[#3f3f3f]" },
};

export function isGoalCategory(value: unknown): value is GoalCategory {
  return typeof value === "string" && (GOAL_CATEGORY_KEYS as readonly string[]).includes(value);
}

const RULES: [GoalCategory, RegExp][] = [
  ["medication", /\b(medicine|medication|meds?|tablets?|pills?|inhaler|insulin|dose|prescription|vitamins?)\b/i],
  ["smoking", /\b(smok\w*|cigarettes?|vap\w*|nicotine)\b/i],
  ["sleep", /\b(sleep\w*|bed(time)?|nap\w*|wake up|lights out)\b/i],
  ["walk", /\b(walk\w*|steps|hike|hiking|stroll)\b/i],
  ["workout", /\b(push.?ups?|sit.?ups?|squats?|gym|workout|exercise|run\w*|jog\w*|swim\w*|yoga|cycl\w*|bike|stretch\w*|plank|weights?)\b/i],
  ["mindfulness", /\b(meditat\w*|mindful\w*|breath\w*|journal\w*|gratitude|relax\w*)\b/i],
  ["food_drink", /\b(water|eat\w*|meals?|fruit|veg\w*|breakfast|lunch|dinner|snack\w*|sugar|alcohol|drink\w*|recipes?|cook\w*)\b/i],
];

/** Keyword fallback used when the AI classifier isn't available. */
export function guessCategory(text: string): GoalCategory {
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}
