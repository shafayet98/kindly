"use client";

import { useActionState, useRef } from "react";
import { saveGoalChanges, type ActionResult } from "@/app/(patient)/goal-actions";
import { GoalFields } from "@/components/goals/goal-fields";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { GoalInput } from "@/lib/goals/service";

export function EditGoalForm({ goalId, initial }: { goalId: string; initial: GoalInput }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(saveGoalChanges, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="stack-32">
      <input type="hidden" name="goalId" value={goalId} />
      {result && <Notice tone={result.ok ? "success" : "error"}>{result.ok ? result.message : result.error}</Notice>}
      <GoalFields initial={initial} idPrefix={`edit-${goalId}`} />
      <div className="row" style={{ gap: 16 }}>
        <SubmitButton>Save changes</SubmitButton>
        <Button
          variant="link"
          onClick={() => {
            const details = formRef.current?.closest("details");
            if (details) details.open = false;
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
