"use client";

import { useActionState } from "react";
import { saveGoalChanges, type ActionResult } from "@/app/(patient)/goal-actions";
import { GoalFields } from "@/components/goals/goal-fields";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { GoalInput } from "@/lib/goals/service";

export function EditGoalForm({ goalId, initial }: { goalId: string; initial: GoalInput }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(saveGoalChanges, null);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-2xl bg-background p-4">
      <input type="hidden" name="goalId" value={goalId} />
      {result && <Notice tone={result.ok ? "success" : "error"}>{result.ok ? result.message : result.error}</Notice>}
      <GoalFields initial={initial} idPrefix={`edit-${goalId}`} />
      <SubmitButton variant="secondary" className="self-start">
        Save changes
      </SubmitButton>
    </form>
  );
}
