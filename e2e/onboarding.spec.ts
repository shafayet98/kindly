import { expect, test } from "@playwright/test";
import { appUserId, createConfirmedUser, db, deleteUser, signIn, signOut, sql } from "./helpers";

test.describe("first-time onboarding", () => {
  let account: { email: string; authUserId: string };

  test.beforeEach(async () => {
    account = await createConfirmedUser("e2e.onboarding");
  });
  test.afterEach(async () => {
    await deleteUser(account.authUserId);
  });

  test("multi-select focus areas persist, and onboarding never repeats (AC-19, AC-20, AC-26)", async ({ page }) => {
    await signIn(page, account.email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "What would you like Kindly to help you with?" })).toBeVisible();

    await page.getByLabel(/What should we call you/).fill("Sam <b>");
    await page.getByLabel(/Health & healthy habits/).check();
    await page.getByLabel(/Emotional wellbeing/).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();

    // Refresh keeps the step; going back shows the saved selections.
    await page.reload();
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "What would you like Kindly to help you with?" })).toBeVisible();
    await expect(page.getByLabel(/Health & healthy habits/)).toBeChecked();
    await expect(page.getByLabel(/Emotional wellbeing/)).toBeChecked();
    await expect(page.getByLabel(/Reminders & routines/)).not.toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();

    await page.getByLabel("Walk three times a week").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
    await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi Sam b. How can we help today?");
    await expect(page.getByText("Walk three times a week")).toBeVisible();
    // Emotional wellbeing selected, so the feelings shortcut is ranked first.
    await expect(page.getByRole("list").filter({ hasText: "I'm feeling unwell" }).getByRole("link").first()).toHaveText("Talk about how I'm feeling");

    await signOut(page);
    await signIn(page, account.email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("skipping everything still completes onboarding and grants no consent (AC-20, AC-24, AC-30)", async ({ page }) => {
    await signIn(page, account.email);
    await expect(page.getByRole("heading", { name: "What would you like Kindly to help you with?" })).toBeVisible();
    await page.getByLabel(/Emotional wellbeing/).check();
    await page.getByLabel(/I'm feeling unwell/).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
    await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const userId = await appUserId(account.authUserId);
    const consents = await db.execute(sql`select purpose from consents where user_id = ${userId}`);
    expect(consents).toHaveLength(0);

    // "I'm feeling unwell" shows the safety boundary and seek-care route (AC-23).
    await page.getByRole("link", { name: "I'm feeling unwell" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("call 000");
    await expect(page.getByText("can't diagnose")).toBeVisible();
  });

  test("editing focus areas updates suggestions but not consent (AC-21)", async ({ page }) => {
    await signIn(page, account.email);
    await expect(page.getByRole("heading", { name: "What would you like Kindly to help you with?" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
    await page.getByLabel("Remember my habit check-ins").check();
    await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("link", { name: "Edit focus areas" }).click();
    await page.getByLabel(/Track my progress/).check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("list").filter({ hasText: "I'm feeling unwell" }).getByRole("link").first()).toHaveText("How am I doing?");

    const userId = await appUserId(account.authUserId);
    const consents = await db.execute<{ purpose: string }>(sql`select purpose from consents where user_id = ${userId} and status = 'granted'`);
    expect(consents.map((row) => row.purpose)).toEqual(["health_data_processing"]);
  });
});
