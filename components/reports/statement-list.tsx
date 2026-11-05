type Kind = "observation" | "hypothesis" | "system";

const BADGE: Record<Kind, { label: string; className: string }> = {
  observation: { label: "Reported", className: "bg-primary-soft text-primary" },
  hypothesis: { label: "Pattern to discuss", className: "bg-accent-soft text-foreground" },
  system: { label: "Approved change", className: "bg-[#ece9f6] text-[#4b3f8a]" },
};

export function StatementList({ statements }: { statements: { text: string; sources: string[]; kind: Kind }[] }) {
  if (statements.length === 0) return <p className="text-muted">Nothing to show for this period.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {statements.map((statement, index) => (
        <li key={index} className="rounded-xl border border-border bg-surface p-3">
          <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[statement.kind].className}`}>{BADGE[statement.kind].label}</span>
          {statement.text}
          {statement.sources.length > 0 && (
            <details className="mt-1 text-xs text-muted">
              <summary className="cursor-pointer">Based on {statement.sources.length} record{statement.sources.length === 1 ? "" : "s"}</summary>
              <p className="mt-1 break-all font-mono">{statement.sources.join(", ")}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
