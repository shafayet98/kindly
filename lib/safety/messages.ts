import { SAFETY_CONTACTS } from "./contacts";

// Predefined safety responses. Agents read these instead of improvising.
// PENDING CLINICAL REVIEW before any real deployment.

export const SAFETY_CATEGORIES = ["medical_emergency", "self_harm_or_suicide", "harm_to_others", "other_urgent"] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

const { emergency, crisis } = SAFETY_CONTACTS;

export const SAFETY_MESSAGES: Record<SafetyCategory, string> = {
  medical_emergency: `This could be a medical emergency. Please call ${emergency.number} right now, or ask someone near you to call. I'm an AI, I can't assess this or send help myself.`,
  self_harm_or_suicide: `I'm really glad you told me. Your safety matters most right now. If you might act on these thoughts, call ${emergency.number} now. You can also call ${crisis.label.split(" (")[0]} on ${crisis.number}, any time, day or night. I'm an AI and I can't contact anyone for you, but I can stay with you while you reach out.`,
  harm_to_others: `If anyone is in immediate danger, please call ${emergency.number} now. I'm an AI and I can't contact anyone for you.`,
  other_urgent: `This sounds urgent. If you or anyone else is in danger, call ${emergency.number}. For urgent support you can call ${crisis.label.split(" (")[0]} on ${crisis.number}. I'm an AI and I can't contact anyone for you.`,
};
