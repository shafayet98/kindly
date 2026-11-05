import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Provisions the app user rows for a confirmed test identity (mirrors ensureAppUser). */
export async function ensureAppUserForScript(authUserId: string) {
  const [user] = await db.insert(schema.users).values({ authUserId }).returning({ id: schema.users.id });
  await db.insert(schema.patientProfiles).values({ userId: user.id });
  await db.insert(schema.callPreferences).values({ userId: user.id });
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, user.id));
  return row.id;
}
