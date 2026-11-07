import type { Metadata } from "next";
import Link from "next/link";
import { Chip, Empty, PageHead, PersonAvatar } from "@/components/kindly/parts";
import { requireApprovedClinician } from "@/lib/auth/session";
import { sharedReportsForClinician } from "@/lib/reports/service";

export const metadata: Metadata = { title: "Tasks" };

export default async function ClinicianTasksPage() {
  const clinician = await requireApprovedClinician();
  const reports = await sharedReportsForClinician(clinician.id);
  const toReview = reports.filter((report) => !report.reviewedAt);
  const reviewed = reports.filter((report) => report.reviewedAt);
  const day = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  const period = (report: (typeof reports)[number]) => `${day(report.periodStart)} – ${day(report.periodEnd)}`;

  return (
    <>
      <PageHead title="Tasks" sub="Reports your patients have chosen to share with you." />
      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="stack" aria-labelledby="tr-h">
          <h2 id="tr-h" className="subhead">
            Shared reports to review <span className="label">· {toReview.length}</span>
          </h2>
          {toReview.length === 0 ? (
            <p className="muted">Nothing waiting.</p>
          ) : (
            toReview.map((report) => (
              <Link key={report.reportId} className="list-card" href={`/clinician/reports/${report.reportId}`}>
                <PersonAvatar name={report.patientName ?? "Patient"} />
                <span>
                  <span style={{ fontWeight: 500, display: "block" }}>
                    {report.patientName ?? "Patient"} · {period(report)}
                  </span>
                  <span className="small muted">shared {day(report.sharedAt)}</span>
                </span>
                <Chip tone="planned" icon="clock">
                  Not reviewed
                </Chip>
              </Link>
            ))
          )}
        </section>
        <section className="stack" aria-labelledby="rd-h">
          <h2 id="rd-h" className="subhead">
            Reviewed <span className="label">· {reviewed.length}</span>
          </h2>
          {reviewed.length === 0 ? (
            <Empty icon="check" title="Nothing reviewed yet">
              <p className="muted small">Reports you mark as reviewed move here.</p>
            </Empty>
          ) : (
            reviewed.map((report) => (
              <Link key={report.reportId} className="list-card" href={`/clinician/reports/${report.reportId}`}>
                <PersonAvatar name={report.patientName ?? "Patient"} />
                <span>
                  <span style={{ fontWeight: 500, display: "block" }}>
                    {report.patientName ?? "Patient"} · {period(report)}
                  </span>
                  <span className="small muted">reviewed {day(report.reviewedAt!)}</span>
                </span>
                <Chip tone="done" icon="check">
                  Reviewed
                </Chip>
              </Link>
            ))
          )}
        </section>
      </div>
    </>
  );
}
