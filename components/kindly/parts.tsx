import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentKey } from "@/lib/agents/directory";
import { GOAL_CATEGORIES, type GoalCategory } from "@/lib/goals/categories";
import type { ItemStatus } from "@/lib/goals/schedule";
import { Icon, type IconName } from "./icon";

export { Icon, type IconName };

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Kindly home">
      <span className="brand__mark" aria-hidden="true">
        k
      </span>
      Kindly
    </Link>
  );
}

const AGENT_NAMES: Record<AgentKey, string> = { natalie: "Natalie", milo: "Milo", sarah: "Sarah", theo: "Theo", iris: "Iris", clara: "Clara" };

export function Avatar({ agent, size = "", className = "" }: { agent: AgentKey; size?: "" | "sm" | "lg" | "xl"; className?: string }) {
  return (
    <span className={`avatar avatar--${agent} ${size ? `avatar--${size}` : ""} ${className}`} aria-hidden="true">
      {AGENT_NAMES[agent][0]}
    </span>
  );
}

/** Initials avatar for a person (clinician or patient). */
export function PersonAvatar({ name, size = "" }: { name: string; size?: "" | "lg" }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`avatar avatar--human ${size ? `avatar--${size}` : ""}`} aria-hidden="true" style={size === "lg" ? { fontSize: 30 } : undefined}>
      {initials || "?"}
    </span>
  );
}

export function AiTag() {
  return <span className="ai-tag">AI</span>;
}

const CATEGORY_ICON: Record<GoalCategory, IconName> = {
  walk: "walk",
  workout: "workout",
  medication: "medication",
  sleep: "sleep",
  food_drink: "food",
  smoking: "smoking",
  mindfulness: "mindfulness",
  other: "other",
};

export function categoryIcon(category: GoalCategory): IconName {
  return CATEGORY_ICON[category];
}

export function CatIcon({ category, size = "", label = false }: { category: GoalCategory; size?: "" | "sm"; label?: boolean }) {
  return (
    <span className={`cat-icon ${size ? `cat-icon--${size}` : ""}`}>
      <Icon name={CATEGORY_ICON[category]} />
      {label && <span className="sr-only">{GOAL_CATEGORIES[category].label}</span>}
    </span>
  );
}

export function CatChip({ category }: { category: GoalCategory }) {
  return (
    <span className="cat">
      <Icon name={CATEGORY_ICON[category]} className="icon--sm" />
      {GOAL_CATEGORIES[category].label}
    </span>
  );
}

export type StatusKind = ItemStatus | "upcoming" | "moved";

const STATUS: Record<StatusKind, { label: string; icon: IconName; css: string }> = {
  done: { label: "Done", icon: "check", css: "done" },
  not_done: { label: "Not done", icon: "dash", css: "notdone" },
  postponed: { label: "Moved", icon: "moved", css: "moved" },
  moved: { label: "Moved", icon: "moved", css: "moved" },
  planned: { label: "Planned", icon: "clock", css: "planned" },
  upcoming: { label: "Coming up", icon: "clock", css: "planned" },
};

export function Status({ kind, children }: { kind: StatusKind; children?: ReactNode }) {
  const status = STATUS[kind];
  return (
    <span className={`status status--${status.css}`}>
      <Icon name={status.icon} />
      {children ?? status.label}
    </span>
  );
}

/** A status chip with any look: ok, warn, live, done, planned, notdone. */
export function Chip({ tone, icon, children }: { tone: "ok" | "warn" | "live" | "done" | "planned" | "notdone" | "moved"; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`status status--${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function PageHead({ title, sub, label, children }: { title: string; sub?: ReactNode; label?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="stack" style={{ gap: 10 }}>
        {label && <p className="label">{label}</p>}
        <h1 className="headline">{title}</h1>
        {sub && <p className="body-lg muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="back link" href={href}>
      <Icon name="arrow-left" className="icon--sm" />
      {children}
    </Link>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__art">
        <Icon name={icon} className="icon--xl" />
      </span>
      <p className="title">{title}</p>
      {children}
    </div>
  );
}

/** Summary row for a details.panel with a chevron. */
export function PanelSummary({ icon, children, accent = false }: { icon?: IconName; children: ReactNode; accent?: boolean }) {
  return (
    <summary>
      {icon &&
        (accent ? (
          <span className="cat-icon cat-icon--sm" style={{ background: "var(--ember)" }}>
            <Icon name={icon} />
          </span>
        ) : (
          <Icon name={icon} className="icon--sm" />
        ))}
      {children}
      <Icon name="chev-down" className="chev" />
    </summary>
  );
}

export function Footer({ lead = "AI companions, not clinicians.", children }: { lead?: string; children: ReactNode }) {
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        <Icon name="info" />
        <p>
          {lead && <strong>{lead}</strong>} {children}
        </p>
      </div>
    </footer>
  );
}
