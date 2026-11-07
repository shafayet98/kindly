"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteAccount, type DeleteState } from "./actions";

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, {} as DeleteState);
  const [word, setWord] = useState("");
  return (
    <form action={action} className="stack-24">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <div className="field" style={{ maxWidth: 360 }}>
        <label className="field__label" htmlFor="del">
          Type DELETE to confirm
        </label>
        <input className="input" id="del" name="confirm" autoComplete="off" value={word} onChange={(event) => setWord(event.target.value)} />
      </div>
      <div>
        <SubmitButton variant="danger" disabled={word.trim() !== "DELETE"}>
          Delete my account and data
        </SubmitButton>
      </div>
    </form>
  );
}
