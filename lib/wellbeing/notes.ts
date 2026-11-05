import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";

// Sarah's private notes. Separate table, separate consent, readable only by the person (and by
// Sarah during their own session). Never included in reports or shown to clinicians.

export const NOTE_RETENTION_DAYS = 30;

export class WellbeingNoteError extends Error {}

export async function saveWellbeingNote(userId: string, content: string) {
  const consents = await getConsentState(userId);
  if (!consents.sensitive_wellbeing) {
    throw new WellbeingNoteError("Keeping private notes needs permission first, in Settings → Privacy & data. Nothing was saved.");
  }
  const [note] = await db
    .insert(schema.wellbeingNotes)
    .values({
      userId,
      content: content.trim().slice(0, 1000),
      visibility: "private",
      retentionPolicy: `${NOTE_RETENTION_DAYS}_days`,
      expiresAt: new Date(Date.now() + NOTE_RETENTION_DAYS * 86_400_000),
    })
    .returning({ id: schema.wellbeingNotes.id });
  await audit({ actorUserId: userId, actorType: "agent", actorLabel: "sarah", resourceType: "wellbeing_note", resourceId: note.id, action: "wellbeing_note.saved", result: "success" });
  return note.id;
}

export async function listWellbeingNotes(userId: string) {
  return db
    .select({ id: schema.wellbeingNotes.id, content: schema.wellbeingNotes.content, createdAt: schema.wellbeingNotes.createdAt, expiresAt: schema.wellbeingNotes.expiresAt })
    .from(schema.wellbeingNotes)
    .where(and(eq(schema.wellbeingNotes.userId, userId), or(isNull(schema.wellbeingNotes.expiresAt), gt(schema.wellbeingNotes.expiresAt, new Date()))))
    .orderBy(desc(schema.wellbeingNotes.createdAt));
}

export async function deleteWellbeingNote(userId: string, noteId: string) {
  await db.delete(schema.wellbeingNotes).where(and(eq(schema.wellbeingNotes.id, noteId), eq(schema.wellbeingNotes.userId, userId)));
  await audit({ actorUserId: userId, actorType: "patient", resourceType: "wellbeing_note", resourceId: noteId, action: "wellbeing_note.deleted", result: "success" });
}

/** Permanently deletes notes past their retention date. Returns how many were removed. */
export async function purgeExpiredNotes() {
  const removed = await db.delete(schema.wellbeingNotes).where(lt(schema.wellbeingNotes.expiresAt, new Date())).returning({ id: schema.wellbeingNotes.id });
  return removed.length;
}
