"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** A submit button that disables itself while its form is submitting, preventing double submits. */
export function SubmitButton({ disabled, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || disabled} aria-disabled={pending || disabled} {...props} />;
}
