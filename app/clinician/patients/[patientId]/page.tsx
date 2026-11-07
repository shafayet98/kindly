import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { BackLink, Chip, Empty, Icon, PageHead } from "@/components/kindly/parts";
import { audit } from "@/lib/audit";
import { requireApprovedClinician } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { sharedReportsForClinician } from "@/lib/reports/service";

export const metadata: Metadata = { title: "Patient" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClinicianPatientPage({ params }: PageProps<"/clinician/patients/[patientId]">) {
  const clinician = await requireApprovedClinician();
  const { patientId } = await params;
  if (!UUID.test(patientId)) notFound();

  const [patient] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.clinicianRelationships)
    .innerJoin(schema.users, eq(schema.users.id, schema.clinicianRelationships.patientId))
    .where(and(eq(schema.clinicianRelationships.clinicianId, clinician.id), eq(schema.clinicianRelationships.patientId, patientId), eq(schema.clinicianRelationships.status, "active")));
  await audit({ actorUserId: clinician.id, actorType: "clinician", resourceType: "patient", resourceId: patientId, action: "patient.viewed", result: patient ? "success" : "denied" });
  // Same response whether the patient doesn't exist or isn't linked: nothing leaks (AC-16).
  if (!patient) notFound();

  const reports = (await sharedReportsForClinician(clinician.id)).filter((report) => report.patientId === patientId);
  const day = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "UTC" }).format(date);

  return (
    <>
      <BackLink href="/clinician/patients">Patients</BackLink>
      <PageHead title={patient.displayName ?? "Patient"} sub="Only reports this patient has shared with you appear here. Private wellbeing conversations are never shared." />
      <section className="stack" aria-labelledby="sr-h">
        <h2 id="sr-h" className="label">
          SHARED REPORTS
        </h2>
        {reports.length === 0 ? (
          <Empty icon="users" title="Nothing shared">
            <p className="muted small">This patient hasn&apos;t shared a report with you.</p>
          </Empty>
        ) : (
          reports.map((report) => (
            <Link key={report.reportId} className="list-card" href={`/clinician/reports/${report.reportId}`} style={{ padding: 24 }}>
              <span className="cat-icon">
                <Icon name="calendar" />
              </span>
              <span>
                <span className="title" style={{ display: "block" }}>
                  Report {day(report.periodStart)} – {day(report.periodEnd)}
                </span>
                <span className="muted small">Shared {day(report.sharedAt)}</span>
              </span>
              <span className="row" style={{ gap: 10 }}>
                {report.reviewedAt ? (
                  <Chip tone="done" icon="check">
                    Reviewed
                  </Chip>
                ) : (
                  <Chip tone="planned" icon="clock">
                    Not reviewed
                  </Chip>
                )}
                <Icon name="chev-right" />
              </span>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
