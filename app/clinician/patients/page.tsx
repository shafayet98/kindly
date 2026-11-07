import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Chip, Icon, PageHead, PersonAvatar } from "@/components/kindly/parts";
import { requireApprovedClinician } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { sharedReportsForClinician } from "@/lib/reports/service";

export const metadata: Metadata = { title: "Patients" };

export default async function ClinicianPatientsPage() {
  const clinician = await requireApprovedClinician();
  // Only patients with an active relationship to this clinician; what's visible is limited
  // further to reports each patient has explicitly shared.
  const [patients, shared] = await Promise.all([
    db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.clinicianRelationships)
      .innerJoin(schema.users, eq(schema.users.id, schema.clinicianRelationships.patientId))
      .where(and(eq(schema.clinicianRelationships.clinicianId, clinician.id), eq(schema.clinicianRelationships.status, "active"))),
    sharedReportsForClinician(clinician.id),
  ]);

  return (
    <>
      <PageHead title="Your patients" sub="Fictional demonstration data. You see only what each patient has chosen to share." />
      {patients.length ? (
        <ul className="grid-2">
          {patients.map((patient) => {
            const reports = shared.filter((report) => report.patientId === patient.id);
            const unreviewed = reports.filter((report) => !report.reviewedAt).length;
            const name = patient.displayName ?? "Patient";
            return (
              <li key={patient.id}>
                <Link className="list-card" href={`/clinician/patients/${patient.id}`} style={{ padding: 24 }}>
                  <PersonAvatar name={name} size="lg" />
                  <span>
                    <span className="title" style={{ display: "block" }}>
                      {name}
                    </span>
                    <span className="muted">{reports.length ? `${reports.length} shared report${reports.length > 1 ? "s" : ""}` : "Nothing shared yet"}</span>
                  </span>
                  <span className="row" style={{ gap: 10 }}>
                    {unreviewed > 0 && (
                      <Chip tone="live" icon="clock">
                        {unreviewed} to review
                      </Chip>
                    )}
                    <Icon name="chev-right" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card muted">No patients are linked to your account yet.</p>
      )}
    </>
  );
}
