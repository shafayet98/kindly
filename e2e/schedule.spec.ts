import { expect, test } from "@playwright/test";
import { appUserId, createConfirmedUser, db, deleteUser, signIn, sql } from "./helpers";

async function alexScheduledJobs() {
  return db.execute<{ due_at: Date }>(
    sql`select j.due_at from call_jobs j join users u on u.id = j.user_id where u.display_name = 'Alex Rivera' and j.status = 'scheduled'`,
  );
}

test("moving a reminder in the UI saves once and reschedules its call (AC-03, AC-13)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/schedule");
  const walk = page.getByRole("region", { name: "Your reminders" }).getByRole("listitem").filter({ hasText: "Morning walk" });
  await expect(walk).toContainText("8:00 AM · Mon, Wed, Fri · Phone call from Milo");
  await expect(walk).toContainText("Next call:");

  await walk.getByText("Change time or days").click();
  await walk.getByLabel("New time").fill("17:00");
  await walk.getByRole("button", { name: "Save changes" }).click();
  await expect(walk.getByRole("status")).toHaveText("Moved from 08:00 to 17:00.");
  await expect(walk).toContainText("5:00 PM · Mon, Wed, Fri");

  const jobs = await alexScheduledJobs();
  expect(jobs).toHaveLength(1);
  expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Adelaide", hour: "2-digit", minute: "2-digit" }).format(new Date(jobs[0].due_at))).toBe("17:00");

  await page.goto("/dashboard");
  await expect(page.getByText("Next: Morning walk at 5:00 PM")).toBeVisible();
});

test("pausing calls cancels pending calls; resuming restores them (AC-11)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Pause all calls" }).click();
  await expect(page.getByText("All calls are paused.")).toBeVisible();
  expect(await alexScheduledJobs()).toHaveLength(0);

  await page.getByRole("button", { name: "Resume calls" }).click();
  await expect(page.getByText("Calls are on.")).toBeVisible();
  expect(await alexScheduledJobs()).toHaveLength(1);
});

test("phone calls need an explicit opt-in with a confirmed number (AC-24, AC-30, AC-41)", async ({ page }) => {
  const account = await createConfirmedUser("e2e.calls");
  try {
    await signIn(page, account.email);
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/schedule");
    await page.getByText("Add a reminder").click();
    await expect(page.getByLabel("A phone call from Milo")).toBeDisabled();

    await page.getByLabel("Your mobile number").fill("0400 000 002");
    await page.getByRole("button", { name: "Turn on phone calls" }).click();
    await expect(page.getByText("Please confirm this is your number")).toBeVisible();

    await expect(page.getByLabel("Your mobile number")).toHaveValue("0400 000 002");
    await page.getByLabel(/This is my number/).check();
    await page.getByRole("button", { name: "Turn on phone calls" }).click();
    await expect(page.getByText("Calls are on.")).toBeVisible();
    await expect(page.getByText("+614 ••••• 002")).toBeVisible();

    const userId = await appUserId(account.authUserId);
    const consents = await db.execute<{ purpose: string; scope: { phone?: string } }>(sql`select purpose, scope from consents where user_id = ${userId} and status = 'granted'`);
    expect(consents).toEqual([{ purpose: "outbound_calls", scope: { phone: "+61400000002" } }]);

    // A "call me now" request is queued for the phone server (not dialled by the web app).
    await page.getByRole("button", { name: "Call me now" }).click();
    await expect(page.getByText(/Calling you now/)).toBeVisible();
    const queued = await db.execute<{ status: string }>(sql`select status from call_jobs where user_id = ${userId} and kind = 'on_demand'`);
    expect(queued.map((row) => row.status)).toEqual(["scheduled"]);

    // Turning calls off revokes consent and cancels anything pending.
    await page.getByRole("button", { name: "Turn off phone calls" }).click();
    await expect(page.getByRole("button", { name: "Turn on phone calls" })).toBeVisible();
    const after = await db.execute<{ status: string }>(sql`select status from call_jobs where user_id = ${userId}`);
    expect(after.map((row) => row.status)).toEqual(["cancelled"]);
    const revoked = await db.execute(sql`select 1 from consents where user_id = ${userId} and purpose = 'outbound_calls' and status = 'granted'`);
    expect(revoked).toHaveLength(0);
  } finally {
    await deleteUser(account.authUserId);
  }
});
