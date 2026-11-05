import { and, desc, eq, isNull } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { CONSENT_TERMS_VERSION } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import type { Insights } from "@/lib/insights/iris";
import { loadInsights } from "@/lib/insights/load";

// Clara: clinician summaries built only from what the person chooses to include. Private
// wellbeing notes are never a source. Sharing is per report, per clinician, with its own consent.

import { REPORT_SCOPES, type ReportScope } from "./scopes";

export { REPORT_SCOPES, type ReportScope };

export type ReportContent = {
  generatedBy: "clara";
  period: Insights["period"];
  sections: { scope: ReportScope; title: string; statements: { text: string; sources: string[]; kind: "observation" | "hypothesis" | "system" }[] }[];
  missingData: Insights["missingData"];
  excluded: string[];
};

export class ReportError extends Error {}

export function buildReportContent(insights: Insights, scopes: ReportScope[]): ReportContent {
  const sections: ReportContent["sections"] = [];
  if (scopes.includes("goals")) {
    sections.push({ scope: "goals", title: "Goals", statements: insights.goals.map((goal) => ({ ...goal.statement, kind: "observation" })) });
  }
  if (scopes.includes("checkins")) {
    sections.push({ scope: "checkins", title: "Patient-reported check-ins", statements: insights.observations.map((s) => ({ ...s, kind: "observation" })) });
  }
  if (scopes.includes("patterns")) {
    sections.push({ scope: "patterns", title: "Patterns to discuss (hypotheses, not conclusions)", statements: insights.hypotheses.map((s) => ({ ...s, kind: "hypothesis" })) });
  }
  if (scopes.includes("plan_changes")) {
    sections.push({ scope: "plan_changes", title: "Plan changes approved by the patient", statements: insights.planChanges.map((s) => ({ ...s, kind: "system" })) });
  }
  return {
    generatedBy: "clara",
    period: insights.period,
    sections,
    missingData: insights.missingData,
    excluded: ["Private wellbeing conversations and notes", "Call recordings and transcripts (never stored)", ...Object.keys(REPORT_SCOPES).filter((s) => !scopes.includes(s as ReportScope)).map((s) => REPORT_SCOPES[s as ReportScope])],
  };
}

export async function createReport(userId: string, timezone: string, weeks: number, scopes: ReportScope[]) {
  if (scopes.length === 0) throw new ReportError("Choose at least one thing to include.");
  const insights = await loadInsights(userId, timezone, weeks);
  const content = buildReportContent(insights, scopes);
  const [report] = await db
    .insert(schema.reports)
    .values({
      patientId: userId,
      periodStart: new Date(`${insights.period.from}T00:00:00Z`),
      periodEnd: new Date(`${insights.period.to}T00:00:00Z`),
      includedScopes: scopes,
      content,
    })
    .returning({ id: schema.reports.id });
  await audit({ actorUserId: userId, actorType: "agent", actorLabel: "clara", resourceType: "report", resourceId: report.id, action: "report.drafted", result: "success", metadata: { scopes } });
  return report.id;
}

export async function getOwnedReport(userId: string, reportId: string) {
  const [report] = await db.select().from(schema.reports).where(and(eq(schema.reports.id, reportId), eq(schema.reports.patientId, userId)));
  return report ?? null;
}

/** Clinicians this patient has an active care relationship with. */
export async function careTeam(userId: string) {
  return db
    .select({ clinicianId: schema.users.id, name: schema.users.displayName })
    .from(schema.clinicianRelationships)
    .innerJoin(schema.users, eq(schema.users.id, schema.clinicianRelationships.clinicianId))
    .where(and(eq(schema.clinicianRelationships.patientId, userId), eq(schema.clinicianRelationships.status, "active"), eq(schema.users.role, "clinician")));
}

export async function shareReport(userId: string, reportId: string, clinicianId: string) {
  const report = await getOwnedReport(userId, reportId);
  if (!report || report.status === "revoked") throw new ReportError("That report wasn't found.");
  const team = await careTeam(userId);
  if (!team.some((member) => member.clinicianId === clinicianId)) throw new ReportError("That clinician isn't part of your care team.");

  // Each share has its own consent record, scoped to this report and this clinician, so it can be
  // revoked on its own.
  const shareId = await db.transaction(async (tx) => {
    const [consent] = await tx
      .insert(schema.consents)
      .values({ userId, purpose: "clinician_sharing", scope: { reportId, clinicianId }, termsVersion: CONSENT_TERMS_VERSION })
      .returning({ id: schema.consents.id });
    const [share] = await tx.insert(schema.reportShares).values({ reportId, clinicianId, consentId: consent.id }).returning({ id: schema.reportShares.id });
    return share.id;
  });
  const share = { id: shareId };
  await db.update(schema.reports).set({ status: "shared", approvedAt: new Date() }).where(eq(schema.reports.id, reportId));
  await audit({ actorUserId: userId, actorType: "patient", resourceType: "report", resourceId: reportId, action: "report.shared", result: "success", metadata: { clinicianId, shareId: share.id } });
  return share.id;
}

export async function revokeShare(userId: string, shareId: string) {
  const [share] = await db
    .select({ id: schema.reportShares.id, reportId: schema.reportShares.reportId, consentId: schema.reportShares.consentId })
    .from(schema.reportShares)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.reportShares.reportId))
    .where(and(eq(schema.reportShares.id, shareId), eq(schema.reports.patientId, userId), isNull(schema.reportShares.revokedAt)));
  if (!share) throw new ReportError("That share wasn't found.");
  await db.update(schema.reportShares).set({ revokedAt: new Date() }).where(eq(schema.reportShares.id, shareId));
  await db.update(schema.consents).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.consents.id, share.consentId));
  await audit({ actorUserId: userId, actorType: "patient", resourceType: "report", resourceId: share.reportId, action: "report.share_revoked", result: "success", metadata: { shareId } });
}

export async function listReports(userId: string) {
  const reports = await db.select().from(schema.reports).where(eq(schema.reports.patientId, userId)).orderBy(desc(schema.reports.createdAt));
  const shares = await db
    .select({ id: schema.reportShares.id, reportId: schema.reportShares.reportId, clinicianId: schema.reportShares.clinicianId, clinicianName: schema.users.displayName, sharedAt: schema.reportShares.sharedAt, revokedAt: schema.reportShares.revokedAt, reviewedAt: schema.reportShares.reviewedAt })
    .from(schema.reportShares)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.reportShares.reportId))
    .innerJoin(schema.users, eq(schema.users.id, schema.reportShares.clinicianId))
    .where(eq(schema.reports.patientId, userId));
  return reports.map((report) => ({ ...report, shares: shares.filter((share) => share.reportId === report.id) }));
}

// ---------- Clinician side ----------

/** A report the clinician may read: shared with them, not revoked, care relationship active. */
export async function getReportForClinician(clinicianId: string, reportId: string) {
  const [row] = await db
    .select({ report: schema.reports, shareId: schema.reportShares.id, reviewedAt: schema.reportShares.reviewedAt, patientName: schema.users.displayName })
    .from(schema.reportShares)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.reportShares.reportId))
    .innerJoin(schema.users, eq(schema.users.id, schema.reports.patientId))
    .innerJoin(
      schema.clinicianRelationships,
      and(eq(schema.clinicianRelationships.patientId, schema.reports.patientId), eq(schema.clinicianRelationships.clinicianId, clinicianId), eq(schema.clinicianRelationships.status, "active")),
    )
    .where(and(eq(schema.reportShares.reportId, reportId), eq(schema.reportShares.clinicianId, clinicianId), isNull(schema.reportShares.revokedAt)));
  await audit({ actorUserId: clinicianId, actorType: "clinician", resourceType: "report", resourceId: reportId, action: "report.viewed", result: row ? "success" : "denied" });
  return row ?? null;
}

export async function sharedReportsForClinician(clinicianId: string) {
  return db
    .select({ reportId: schema.reports.id, patientId: schema.reports.patientId, patientName: schema.users.displayName, sharedAt: schema.reportShares.sharedAt, reviewedAt: schema.reportShares.reviewedAt, periodStart: schema.reports.periodStart, periodEnd: schema.reports.periodEnd })
    .from(schema.reportShares)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.reportShares.reportId))
    .innerJoin(schema.users, eq(schema.users.id, schema.reports.patientId))
    .innerJoin(
      schema.clinicianRelationships,
      and(eq(schema.clinicianRelationships.patientId, schema.reports.patientId), eq(schema.clinicianRelationships.clinicianId, clinicianId), eq(schema.clinicianRelationships.status, "active")),
    )
    .where(and(eq(schema.reportShares.clinicianId, clinicianId), isNull(schema.reportShares.revokedAt)))
    .orderBy(desc(schema.reportShares.sharedAt));
}

/** Set only by a real clinician action, never on generation. */
export async function markReviewed(clinicianId: string, reportId: string) {
  const updated = await db
    .update(schema.reportShares)
    .set({ reviewedAt: new Date() })
    .where(and(eq(schema.reportShares.reportId, reportId), eq(schema.reportShares.clinicianId, clinicianId), isNull(schema.reportShares.revokedAt), isNull(schema.reportShares.reviewedAt)))
    .returning({ id: schema.reportShares.id });
  if (updated.length) await audit({ actorUserId: clinicianId, actorType: "clinician", resourceType: "report", resourceId: reportId, action: "report.reviewed", result: "success" });
}
