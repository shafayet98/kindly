"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftGoal, saveNewGoal, type ActionResult } from "@/app/(patient)/goal-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { GoalInput } from "@/lib/goals/service";
import { GoalFields } from "./goal-fields";

const EXAMPLES = ["Walk 3 days a week", "30 push-ups", "Take my tablets at 8 AM", "In bed by 10:30 on weeknights"];

/** Type a goal in your own words, check what Kindly understood, then save. */
export function AddGoal({ phoneCallsOn, afterSave }: { phoneCallsOn: boolean; afterSave?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<GoalInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [result, save] = useActionState<ActionResult | null, FormData>(saveNewGoal, null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!result?.ok) return;
    if (afterSave) {
      router.push(afterSave);
      return;
    }
    // Reset the flow once a goal is saved; the page itself refreshes with the new data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(null);
    setText("");
    setSavedMessage(result.message ?? "Goal saved.");
  }, [result, afterSave, router]);

  if (!draft) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSavedMessage(null);
          startReading(async () => {
            const response = await draftGoal(text);
            if (response.ok) setDraft(response.draft);
            else setError(response.error);
          });
        }}
      >
        {savedMessage && <Notice tone="success">{savedMessage}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <label htmlFor="goal-text" className="font-semibold">
          What would you like to do?
        </label>
        <input
          id="goal-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={300}
          placeholder="e.g. Walk 3 days a week"
          className="rounded-xl border border-border bg-surface px-4 py-3"
        />
        <div className="flex flex-wrap gap-2" aria-label="Examples">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setText(example)} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:bg-primary-soft">
              {example}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={reading || text.trim().length < 2} className="self-start">
          {reading ? "Reading…" : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <form action={save} className="flex flex-col gap-4">
      <p className="text-sm text-muted">Here&apos;s what we understood. Change anything that&apos;s not right.</p>
      {result && !result.ok && <Notice tone="error">{result.error}</Notice>}
      <GoalFields initial={draft} idPrefix="new-goal" />
      <label className="flex flex-col gap-1.5 font-semibold sm:max-w-sm">
        Reminder
        <select name="remind" defaultValue="none" className="rounded-xl border border-border bg-surface px-3 py-2 font-normal">
          <option value="none">No reminder</option>
          <option value="in_app">In the app</option>
          <option value="phone" disabled={!phoneCallsOn}>
            A phone call from Milo{phoneCallsOn ? "" : " (turn on phone calls first)"}
          </option>
        </select>
        <span className="text-sm font-normal text-muted">Rings at the goal&apos;s time. If it has no time, at 9:00 AM.</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save goal</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
          ← Back
        </Button>
      </div>
    </form>
  );
}
