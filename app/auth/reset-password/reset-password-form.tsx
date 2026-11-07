"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePassword, type FormState } from "@/app/(auth)/actions";

const initial: FormState = { status: "idle" };

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="stack-24" noValidate>
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        error={state.fieldErrors?.password}
      />
      <Field id="confirm" name="confirm" type="password" label="Confirm new password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <SubmitButton size="lg" block>
        Save new password
      </SubmitButton>
    </form>
  );
}
