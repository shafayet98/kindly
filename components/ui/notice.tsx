import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/kindly/icon";

type Tone = "info" | "success" | "error";

const ICONS: Record<Tone, IconName> = { info: "info", success: "check", error: "alert" };

export function Notice({ tone = "info", icon, title, children }: { tone?: Tone; icon?: IconName; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`notice notice--${tone}`}>
      <Icon name={icon ?? ICONS[tone]} />
      <div>
        {title && <p className="notice__title">{title}</p>}
        {typeof children === "string" ? <p>{children}</p> : children}
      </div>
    </div>
  );
}
