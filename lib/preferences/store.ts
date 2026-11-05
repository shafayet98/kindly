import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { normalizeFocusAreas, type FocusAreaKey } from "./focus-areas";

// Callers must pass the id of the authenticated user from the session, never a client value.

export async function getFocusAreas(userId: string): Promise<FocusAreaKey[]> {
  const rows = await db
    .select({ areaKey: schema.userFocusAreas.areaKey })
    .from(schema.userFocusAreas)
    .where(eq(schema.userFocusAreas.userId, userId));
  return normalizeFocusAreas(rows.map((row) => row.areaKey));
}

/** Replaces the user's focus areas. Preferences only: this never changes any consent. */
export async function setFocusAreas(userId: string, areas: unknown[]) {
  const keys = normalizeFocusAreas(areas);
  await db.transaction(async (tx) => {
    await tx.delete(schema.userFocusAreas).where(eq(schema.userFocusAreas.userId, userId));
    if (keys.length > 0) {
      await tx.insert(schema.userFocusAreas).values(keys.map((areaKey) => ({ userId, areaKey })));
    }
    await audit(
      { actorUserId: userId, actorType: "patient", resourceType: "focus_areas", resourceId: userId, action: "focus_areas.updated", result: "success", metadata: { areas: keys } },
      tx,
    );
  });
  return keys;
}
