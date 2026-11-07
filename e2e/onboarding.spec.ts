import { expect, test } from "@playwright/test";
import { appUserId, completeOnboarding, createConfirmedUser, db, deleteUser, signIn, signOut, sql } from "./helpers";

test.describe("first-time onboarding", () => {
  let account: { email: string; authUserId: string };

  test.beforeEach(async () => {
    account = await createConfirmedUser("e2e.onboarding");
  });
  test.afterEach(async () => {
    await deleteUser(account.authUserId);
  });

  test.describe("with location shared", () => {
    // The browser reports a location in Dubai.
    test.use({ geolocation: { latitude: 25.2, longitude: 55.27 }, permissions: ["geolocation", "microphone"] });

    test("name, location, privacy and goal steps run once and resume where they stopped (AC-20, AC-26, AC-27)", async ({ page }) => {
      await signIn(page, account.email);
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(page.getByRole("heading", { name: "Welcome to Kindly" })).toBeVisible();
      await expect(page.getByText(/What would you like Kindly to help you with/)).toHaveCount(0);

      await page.getByLabel(/What should we call you/).fill("Sam <b>");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();

      // Refresh keeps the step.
      await page.reload();
      await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
      await page.getByRole("button", { name: "Use my location" }).click();
      await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();

      const userId = await appUserId(account.authUserId);
      const [user] = await db.execute<{ timezone: string; country_code: string; timezone_source: string }>(sql`select timezone, country_code, timezone_source from users where id = ${userId}`);
      expect(user).toEqual({ timezone: "Asia/Dubai", country_code: "AE", timezone_source: "location" });

      await page.getByLabel(/Keep a short summary/).check();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();
      await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi Sam b. How can we help today?");

      const consents = await db.execute<{ purpose: string }>(sql`select purpose from consents where user_id = ${userId} and status = 'granted'`);
      expect(consents.map((row) => row.purpose)).toEqual(["conversation_summaries"]);

      // Reminders say which timezone and country are used.
      await page.goto("/schedule");
      await expect(page.getByRole("heading", { name: "Your Daily Reminders" })).toBeVisible();
      await expect(page.getByText(/Dubai time \((GST|GMT\+4)\)/)).toBeVisible();
      await expect(page.getByText(/United Arab Emirates/)).toBeVisible();

      await signOut(page);
      await signIn(page, account.email);
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });

  test("skipping everything still completes onboarding and grants no consent (AC-20, AC-23, AC-24, AC-30)", async ({ page }) => {
    await signIn(page, account.email);
    await completeOnboarding(page);

    const userId = await appUserId(account.authUserId);
    expect(await db.execute(sql`select 1 from consents where user_id = ${userId}`)).toHaveLength(0);
    const [user] = await db.execute<{ timezone: string; timezone_source: string }>(sql`select timezone, timezone_source from users where id = ${userId}`);
    expect(user).toEqual({ timezone: "Australia/Adelaide", timezone_source: "device" });

    // An empty but working dashboard, and the "feeling unwell" route is always there.
    await expect(page.getByText(/No goals yet/)).toBeVisible();
    await page.getByRole("link", { name: "Feeling unwell?" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("call 000");
    await expect(page.getByText("can't diagnose")).toBeVisible();
  });

  test("settings have location, no focus areas", async ({ page }) => {
    await signIn(page, account.email);
    await completeOnboarding(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /Location & timezone/ })).toBeVisible();
    await expect(page.getByText(/Focus areas/)).toHaveCount(0);
    await page.getByRole("link", { name: /Location & timezone/ }).click();
    await expect(page.getByText(/Adelaide time \(AC[DS]T\), Australia/)).toBeVisible();
    expect((await page.goto("/settings/focus-areas"))?.status()).toBe(404);
  });
});
