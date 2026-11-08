import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, db, deleteUser, signIn, signOut, sql } from "./helpers";

test("public landing page and email/password-only login (AC-25)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByText(/google|apple|magic link/i)).toHaveCount(0);
});

test("signed-out visitors are sent to login from protected pages (AC-28)", async ({ page }) => {
  for (const path of ["/dashboard", "/onboarding", "/clinician/patients", "/settings/privacy"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test("wrong password gives a non-revealing error (AC-31)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com", "not-the-password-1");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email or password is incorrect.");
  await signIn(page, "nobody.here@example.com", "not-the-password-1");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email or password is incorrect.");
});

test("sign-up enforces the password policy before contacting Supabase (AC-31)", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
});

test("returning patient goes straight to the dashboard and can sign out (AC-22, AC-27)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const action of ["Talk now", "Progress"]) {
    await expect(page.getByRole("region", { name: "Main actions" }).getByRole("link", { name: new RegExp(action) })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Your week" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your companions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Feeling unwell?" })).toBeVisible();
  await expect(page.getByText("What do you need today?")).toHaveCount(0);
  await signOut(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("patients cannot open the clinician portal (AC-29)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/clinician/patients");
  await expect(page).toHaveURL(/\/access-denied$/);
});

test("an approved clinician lands on their patient list", async ({ page }) => {
  await signIn(page, "demo.clinician@example.com");
  await expect(page).toHaveURL(/\/clinician\/patients$/);
  await expect(page.getByText("Alex Rivera")).toBeVisible();
  await expect(page.getByText("Priya Shah")).toHaveCount(0);
});

test("with email confirmation off, sign-up goes straight to onboarding", async ({ page, browser }) => {
  const settings = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
  }).then((response) => response.json());
  test.skip(!settings.mailer_autoconfirm, "Supabase 'Confirm email' is on");

  const email = `signup.e2e.${Date.now()}@example.com`;
  try {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Welcome to Kindly" })).toBeVisible();

    const other = await browser.newPage();
    await other.goto("/signup");
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Password").fill(DEMO_PASSWORD);
    await other.getByRole("button", { name: "Create account" }).click();
    await expect(other.getByRole("main").getByRole("alert")).toContainText("already has an account");
    await other.close();
  } finally {
    const [row] = await db.execute<{ id: string }>(sql`select id from auth.users where email = ${email}`);
    if (row) await deleteUser(row.id);
  }
});
