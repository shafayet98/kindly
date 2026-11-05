// Public descriptions of the six Kindly companions, shown in the UI. All are AI.

export type AgentKey = "natalie" | "milo" | "sarah" | "theo" | "iris" | "clara";

export type AgentProfile = {
  key: AgentKey;
  name: string;
  role: string;
  helpsWith: string;
  limits: string;
  live: boolean; // available as a live voice specialist in the MVP
};

export const AGENTS: Record<AgentKey, AgentProfile> = {
  natalie: {
    key: "natalie",
    name: "Natalie",
    role: "Health & habits",
    helpsWith: "Movement, food, sleep and smoking goals, and getting back on track after a setback.",
    limits: "Can't diagnose or give medical treatment advice.",
    live: true,
  },
  milo: {
    key: "milo",
    name: "Milo",
    role: "Reminders & calls",
    helpsWith: "Setting, moving and pausing reminders, and calling you only when you've asked.",
    limits: "Only sees what he needs to schedule things.",
    live: true,
  },
  sarah: {
    key: "sarah",
    name: "Sarah",
    role: "Wellbeing companion",
    helpsWith: "A calm, private space to talk through stress, motivation and how you're feeling.",
    limits: "Not a therapist or crisis service. Your chats with her stay private by default.",
    live: true,
  },
  theo: {
    key: "theo",
    name: "Theo",
    role: "Planning",
    helpsWith: "Turning what you want into small, practical routines that fit your week.",
    limits: "Only changes your plan after you approve it.",
    live: false,
  },
  iris: {
    key: "iris",
    name: "Iris",
    role: "Insights & progress",
    helpsWith: "Clear summaries of what you've reported, separating facts from guesses.",
    limits: "Works only from data you've allowed for this purpose.",
    live: false,
  },
  clara: {
    key: "clara",
    name: "Clara",
    role: "Care coordination",
    helpsWith: "Preparing summaries for your clinician, shared only when you approve.",
    limits: "Never shares anything without your explicit permission.",
    live: false,
  },
};
