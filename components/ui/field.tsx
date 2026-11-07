import type { ComponentProps } from "react";
import { Icon } from "@/components/kindly/icon";

export function Field({
  label,
  hint,
  error,
  id,
  optional,
  className = "",
  ...input
}: ComponentProps<"input"> & { label: string; hint?: string; error?: string; id: string; optional?: boolean }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
        {optional && <span className="field__opt"> (optional)</span>}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`input ${className}`} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          <Icon name="alert" className="icon--sm" />
          {error}
        </p>
      )}
    </div>
  );
}
