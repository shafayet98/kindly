"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { requestPasswordReset, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.status === "success") return <Notice tone="success">{state.message}</Notice>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
