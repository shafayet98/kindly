import { StatementList } from "./statement-list";
import type { ReportContent } from "@/lib/reports/service";

export function ReportView({ content }: { content: ReportContent }) {
  const shortDate = (day: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Period: {shortDate(content.period.from)} – {shortDate(content.period.to)} ({content.period.timezone}). All data is
        patient-reported unless marked otherwise. Prepared by Clara (AI) from structured records; not a clinical assessment.
      </p>
      {content.sections.map((section) => (
        <section key={section.scope} className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">{section.title}</h3>
          <StatementList statements={section.statements} />
        </section>
      ))}
      {content.missingData.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-lg font-bold">Missing data</h3>
          {content.missingData.map((item, index) => (
            <p key={index} className="text-muted">
              {item.text}
            </p>
          ))}
        </section>
      )}
      <section className="rounded-2xl bg-background p-4 text-sm">
        <p className="font-bold">Not included</p>
        <ul className="list-disc pl-5 text-muted">
          {content.excluded.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
