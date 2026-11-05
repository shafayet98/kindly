"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteAccount, type DeleteState } from "./actions";

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, {} as DeleteState);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <label className="flex flex-col gap-1.5 font-semibold sm:max-w-xs">
        Type DELETE to confirm
        <input name="confirm" autoComplete="off" className="rounded-xl border border-border bg-surface px-3 py-2 font-normal" />
      </label>
      <SubmitButton className="self-start bg-danger hover:bg-danger/90">Delete my account and data</SubmitButton>
    </form>
  );
}
