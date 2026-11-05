// Backend-only clinician approval. Run by an administrator after verifying the person's identity
// and credentials. The account must already exist and have a confirmed email.
// Usage: pnpm clinician:approve someone@example.com      (approve)
//        pnpm clinician:approve someone@example.com --revoke
import "./load-env";
import { and, eq, sql } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email) throw new Error("Usage: pnpm clinician:approve <email> [--revoke]");

  const [authUser] = await db.execute<{ id: string; email_confirmed_at: string | null }>(
    sql`select id, email_confirmed_at from auth.users where lower(email) = ${email}`,
  );
  if (!authUser) throw new Error("No account with that email. Ask them to sign up and confirm their email first.");
  if (!authUser.email_confirmed_at) throw new Error("That account hasn't confirmed its email yet.");

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.authUserId, authUser.id));
  if (!user) throw new Error("That account hasn't signed in yet. Ask them to sign in once, then retry.");

  if (revoke) {
    await db.update(schema.clinicianInvitations).set({ status: "revoked" }).where(and(eq(schema.clinicianInvitations.acceptedUserId, user.id), eq(schema.clinicianInvitations.status, "approved")));
    await db.update(schema.users).set({ role: "patient" }).where(eq(schema.users.id, user.id));
    await audit({ actorType: "admin", actorLabel: "approve-clinician script", resourceType: "user", resourceId: user.id, action: "clinician.revoked", result: "success" });
    console.log(`Revoked clinician access for ${email}.`);
  } else {
    const now = new Date();
    await db.insert(schema.clinicianInvitations).values({
      invitedEmail: email,
      status: "approved",
      approvedBy: "approve-clinician script",
      credentialVerifiedAt: now,
      approvedAt: now,
      expiresAt: new Date(now.getTime() + 365 * 86_400_000),
      acceptedUserId: user.id,
    });
    await db.update(schema.users).set({ role: "clinician" }).where(eq(schema.users.id, user.id));
    await audit({ actorType: "admin", actorLabel: "approve-clinician script", resourceType: "user", resourceId: user.id, action: "clinician.approved", result: "success" });
    console.log(`Approved ${email} as a clinician.`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
