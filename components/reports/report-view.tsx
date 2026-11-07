import { Avatar, Icon } from "@/components/kindly/parts";
import type { ReportContent } from "@/lib/reports/service";

const TAG = {
  observation: { label: "REPORTED", className: "tag" },
  hypothesis: { label: "PATTERN · NOT A CONCLUSION", className: "tag tag--note" },
  system: { label: "APPROVED CHANGE", className: "tag tag--soft" },
} as const;

/** A shared report, laid out like a document. The patient's preview and the clinician see the same thing. */
export function ReportView({ content }: { content: ReportContent }) {
  const date = (day: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const period = `${date(content.period.from)} – ${date(content.period.to)}`;
  return (
    <article className="report" aria-label="Report">
      <header className="report__head">
        <div className="row row--between">
          <p className="label">KINDLY SUMMARY · {period.toUpperCase()}</p>
          <Avatar agent="clara" size="sm" />
        </div>
        <p className="small muted">
          Period: {period} ({content.period.timezone}). All data is patient-reported unless marked otherwise. Prepared by Clara (AI) from structured records; not a clinical assessment.
        </p>
      </header>
      <div className="report__body">
        {content.sections.map((section) => (
          <section key={section.scope} className="report__sec">
            <h3>{section.title}</h3>
            {section.statements.length === 0 && <p className="muted">Nothing to report for this period.</p>}
            {section.statements.map((statement, index) => (
              <div key={index} className="report-item">
                <p>
                  <span className={TAG[statement.kind].className}>{TAG[statement.kind].label}</span> {statement.text}
                </p>
                {statement.basis && <p className="small muted">{statement.basis}</p>}
                {statement.sources.length > 0 && (
                  <details>
                    <summary>
                      <Icon name="chev-right" className="icon--sm" />
                      Based on {statement.sources.length} record{statement.sources.length === 1 ? "" : "s"}
                    </summary>
                    <p className="small muted" style={{ marginTop: 6, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>
                      {statement.sources.join(", ")}
                    </p>
                  </details>
                )}
              </div>
            ))}
          </section>
        ))}
        {content.missingData.length > 0 && (
          <section className="report__sec">
            <h3>Missing data</h3>
            {content.missingData.map((item, index) => (
              <p key={index} className="muted">
                {item.text}
              </p>
            ))}
          </section>
        )}
        <section className="report__sec">
          <div className="card card--sunken" style={{ borderRadius: "var(--bubble)" }}>
            <p style={{ fontWeight: 600 }} className="row">
              <Icon name="lock" className="icon--sm" />
              Not included
            </p>
            <ul className="bullets small">
              {content.excluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </article>
  );
}
