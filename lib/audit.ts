import { db, schema } from "@/lib/db";

type AuditInput = {
  actorUserId?: string | null;
  actorType: (typeof schema.actorType.enumValues)[number];
  actorLabel?: string;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  result: (typeof schema.auditResult.enumValues)[number];
  metadata?: Record<string, unknown>;
};

// Audit records hold identifiers and outcomes only, never health content or transcripts.
export async function audit(entry: AuditInput, tx: Pick<typeof db, "insert"> = db) {
  await tx.insert(schema.auditEvents).values({
    actorUserId: entry.actorUserId ?? null,
    actorType: entry.actorType,
    actorLabel: entry.actorLabel,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    action: entry.action,
    result: entry.result,
    metadata: entry.metadata ?? {},
  });
}
