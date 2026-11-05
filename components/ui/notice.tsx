import type { ReactNode } from "react";

type Tone = "info" | "success" | "error";

const tones: Record<Tone, string> = {
  info: "border-primary/20 bg-primary-soft",
  success: "border-primary/30 bg-primary-soft",
  error: "border-danger/30 bg-danger-soft text-danger",
};

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      {children}
    </div>
  );
}
