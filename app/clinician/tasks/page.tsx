import type { Metadata } from "next";
import Link from "next/link";
import { requireApprovedClinician } from "@/lib/auth/session";
import { sharedReportsForClinician } from "@/lib/reports/service";

export const metadata: Metadata = { title: "Tasks" };

export default async function ClinicianTasksPage() {
  const clinician = await requireApprovedClinician();
  const reports = await sharedReportsForClinician(clinician.id);
  const toReview = reports.filter((report) => !report.reviewedAt);
  const reviewed = reports.filter((report) => report.reviewedAt);
  const day = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "UTC" }).format(date);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Tasks</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Shared reports to review</h2>
        {toReview.length === 0 && <p className="text-muted">Nothing waiting.</p>}
        <ul className="flex flex-col gap-2">
          {toReview.map((report) => (
            <li key={report.reportId}>
              <Link href={`/clinician/reports/${report.reportId}`} className="flex justify-between gap-2 rounded-2xl border border-border bg-surface p-4 hover:border-primary">
                <span className="font-semibold">{report.patientName ?? "Patient"}</span>
                <span className="text-sm text-muted">shared {day(report.sharedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {reviewed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Reviewed</h2>
          <ul className="flex flex-col gap-1 text-muted">
            {reviewed.map((report) => (
              <li key={report.reportId}>
                {report.patientName ?? "Patient"} · reviewed {day(report.reviewedAt!)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
