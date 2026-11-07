"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftGoal, saveNewGoal, type ActionResult } from "@/app/(patient)/goal-actions";
import { Icon } from "@/components/kindly/icon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { GoalInput } from "@/lib/goals/service";
import { GoalFields } from "./goal-fields";

const EXAMPLES = ["Walk 3 days a week", "30 push-ups", "Take my tablets at 8 AM", "In bed by 10:30 on weeknights"];

/** Type a goal in your own words, check what Kindly understood, then save. */
export function AddGoal({ phoneCallsOn, afterSave, idPrefix = "goal" }: { phoneCallsOn: boolean; afterSave?: string; idPrefix?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<GoalInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [result, save] = useActionState<ActionResult | null, FormData>(saveNewGoal, null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const textId = `${idPrefix}-text`;

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

  const read = () => {
    setError(null);
    setSavedMessage(null);
    startReading(async () => {
      const response = await draftGoal(text);
      if (response.ok) setDraft(response.draft);
      else setError(response.error);
    });
  };

  if (!draft) {
    return (
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          read();
        }}
      >
        {savedMessage && <Notice tone="success">{savedMessage}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <label className="field__label" htmlFor={textId} style={{ fontSize: 19 }}>
          What would you like to do?
        </label>
        <div className="row nowrap" style={{ gap: 12 }}>
          <input
            id={textId}
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={300}
            placeholder="e.g. Walk 3 days a week"
            style={{ minHeight: 60, fontSize: 19, borderRadius: "20px 20px 20px 4px", padding: "14px 20px" }}
          />
          <Button type="submit" size="lg" disabled={text.trim().length < 2} aria-busy={reading || undefined}>
            Continue
          </Button>
        </div>
        <div className="chips" aria-label="Examples">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="suggestion" onClick={() => setText(example)}>
              {example}
            </button>
          ))}
        </div>
      </form>
    );
  }

  return (
    <form action={save} className="stack-32">
      <div className="notice notice--success" role="status">
        <Icon name="sparkle" />
        <p>
          <span className="notice__title">Here&apos;s what we understood.</span> Change anything that&apos;s not right.
        </p>
      </div>
      {result && !result.ok && <Notice tone="error">{result.error}</Notice>}
      <GoalFields initial={draft} idPrefix={`${idPrefix}-new`} />
      <div className="field" style={{ maxWidth: 420 }}>
        <label className="field__label" htmlFor={`${idPrefix}-rem`}>
          Reminder
        </label>
        <select className="select" id={`${idPrefix}-rem`} name="remind" defaultValue="none" aria-describedby={`${idPrefix}-rem-hint`}>
          <option value="none">No reminder</option>
          <option value="in_app">In the app</option>
          <option value="phone" disabled={!phoneCallsOn}>
            Phone call from Milo{phoneCallsOn ? "" : " (turn on phone calls first)"}
          </option>
        </select>
        <p className="field__hint" id={`${idPrefix}-rem-hint`}>
          Rings at the goal&apos;s time. If it has no time, at 9:00 AM.
        </p>
      </div>
      <div className="row" style={{ gap: 16 }}>
        <SubmitButton size="lg">Save goal</SubmitButton>
        <Button variant="link" onClick={() => setDraft(null)}>
          Change what I typed
        </Button>
      </div>
    </form>
  );
}
