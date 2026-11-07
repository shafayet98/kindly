import Link from "next/link";
import type { ComponentProps } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "highlight" | "danger" | "danger-ghost" | "link";
export type Size = "sm" | "md" | "lg";

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = "", block = false) {
  return ["btn", `btn--${variant}`, size !== "md" ? `btn--${size}` : "", block ? "btn--block" : "", className].filter(Boolean).join(" ");
}

type Common = { variant?: Variant; size?: Size; block?: boolean };

export function Button({ variant = "primary", size = "md", block, className, type = "button", ...props }: ComponentProps<"button"> & Common) {
  return <button type={type} className={buttonClasses(variant, size, className, block)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", block, className, ...props }: ComponentProps<typeof Link> & Common) {
  return <Link className={buttonClasses(variant, size, className, block)} {...props} />;
}
