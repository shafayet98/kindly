import { expect, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** A confirmed, brand-new account (as if the person had clicked the email link). */
export async function createConfirmedUser(prefix: string) {
  const email = `${prefix}.${Date.now()}@example.com`;
  const { data, error } = await createSupabaseAdminClient().auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error;
  return { email, authUserId: data.user.id };
}

export async function deleteUser(authUserId: string) {
  await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
}

export async function appUserId(authUserId: string) {
  const [row] = await db.execute<{ id: string }>(sql`select id from users where auth_user_id = ${authUserId}`);
  return row?.id;
}

export { db, sql };

/** Walks a brand-new account through onboarding: optional name, device timezone, chosen permissions, no goal. */
export async function completeOnboarding(page: Page, options: { nickname?: string; consents?: (string | RegExp)[] } = {}) {
  await expect(page.getByRole("heading", { name: "Welcome to Kindly" })).toBeVisible();
  if (options.nickname) await page.getByLabel(/What should we call you/).fill(options.nickname);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
  await page.getByRole("button", { name: /use this device's timezone/ }).click();
  await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
  for (const label of options.consents ?? []) await page.getByLabel(label).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();
  await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
