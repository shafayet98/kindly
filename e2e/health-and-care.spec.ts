import { expect, test } from "@playwright/test";
import { runTool } from "@/lib/agents/tools/run";
import { setConsent } from "@/lib/consent/store";
import { createReport, shareReport } from "@/lib/reports/service";
import { createGoal } from "@/lib/goals/service";
import { appUserId, completeOnboarding, createConfirmedUser, db, deleteUser, signIn, sql } from "./helpers";

async function alex() {
  const [row] = await db.execute<{ id: string; timezone: string }>(sql`select id, timezone from users where display_name = 'Alex Rivera'`);
  return row;
}

test("vague food reports are stored as described, without invented numbers (AC-07)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/goals");
  await page.getByText("Other check-ins").click();
  await page.getByLabel("What kind?").selectOption("food");
  await page.getByLabel("In your own words").fill("A big bowl of pasta for lunch");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText("“A big bowl of pasta for lunch”")).toBeVisible();

  const [event] = await db.execute<{ value: string | null; unit: string | null; source: string; certainty: string }>(
    sql`select value, unit, source, certainty from habit_events where description = 'A big bowl of pasta for lunch'`,
  );
  expect(event).toEqual({ value: null, unit: null, source: "patient_reported", certainty: "low" });
});

test("a correction links to the original and summaries use the corrected value (AC-08)", async ({ page }) => {
  const { id: userId, timezone } = await alex();
  const ctx = { userId, sessionId: null, agent: "natalie" as const, channel: "browser" as const, timezone };
  const logged = await runTool(ctx, "log_habit", { kind: "activity", description: "walked 30 minutes", value: 30, unit: "minutes", days_ago: 0, certainty: "medium" });
  expect(logged.ok && logged.result.saved).toBe(true);
  const entryId = logged.ok ? String(logged.result.entry_id) : "";

  const corrected = await runTool(ctx, "correct_habit", { entry_id: entryId, value: 20, description: null });
  expect(corrected.ok && corrected.result.corrected).toBe(true);
  const again = await runTool(ctx, "correct_habit", { entry_id: entryId, value: 10, description: null });
  expect(again.ok && "error" in again.result).toBe(true); // the original can't be corrected twice

  const rows = await db.execute<{ id: string; value: string; corrected_from: string | null; superseded_at: string | null }>(
    sql`select id, value, corrected_from, superseded_at from habit_events where id = ${entryId} or corrected_from = ${entryId} order by created_at`,
  );
  expect(rows.map((row) => [row.value, row.corrected_from === entryId, row.superseded_at !== null])).toEqual([
    ["30", false, true],
    ["20", true, false],
  ]);

  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/goals");
  await page.getByText("Other check-ins").click();
  const entry = page.getByRole("listitem").filter({ hasText: "“walked 30 minutes”" }); // description kept
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Activity · 20 minutes");
  await expect(entry).toContainText("corrected");
});

test("Sarah's private notes stay with Sarah: other agents, reports and clinicians can't read them (AC-06)", async ({ page }) => {
  const { id: userId, timezone } = await alex();
  const sarah = { userId, sessionId: null, agent: "sarah" as const, channel: "browser" as const, timezone };

  const refused = await runTool(sarah, "save_wellbeing_note", { note: "Feeling overwhelmed by the roster change" });
  expect(refused.ok && "error" in refused.result).toBe(true); // needs its own consent

  await setConsent(userId, "sensitive_wellbeing", true);
  const saved = await runTool(sarah, "save_wellbeing_note", { note: "Feeling overwhelmed by the roster change" });
  expect(saved.ok && saved.result.saved).toBe(true);

  const natalie = await runTool({ ...sarah, agent: "natalie" }, "get_wellbeing_notes", {});
  expect(natalie).toEqual({ ok: false, error: "get_wellbeing_notes is not available to this companion." });
  const milo = await runTool({ ...sarah, agent: "milo" }, "save_wellbeing_note", { note: "x" });
  expect(milo.ok).toBe(false);

  // Even a report with every section included never contains the note.
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/care-sharing");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Prepare a preview" }).click();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  await expect(page.getByText("Private wellbeing conversations and notes")).toBeVisible();
  await expect(page.getByText(/overwhelmed/)).toHaveCount(0);

  // The person can see and delete it.
  await page.goto("/settings/privacy");
  await expect(page.getByText("Feeling overwhelmed by the roster change")).toBeVisible();
  await page.getByRole("region", { name: "Private notes with Sarah" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Feeling overwhelmed by the roster change")).toHaveCount(0);
});

test("a report the patient doesn't share is invisible to the clinician; a shared one is visible until revoked (AC-09, AC-10, AC-16)", async ({ page, browser }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/care-sharing");
  await page.getByRole("button", { name: "Prepare a preview" }).click();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  const reportUrl = new URL(page.url());
  const reportId = reportUrl.pathname.split("/").pop()!;
  await expect(page.getByText(/“Morning walk”: \d+ of \d+ sessions done/)).toBeVisible();

  // Sharing needs the explicit confirmation box.
  await page.getByRole("button", { name: "Share report" }).click();
  await expect(page.getByText("Please confirm you want to share this report.")).toBeVisible();

  // Not shared yet: the clinician sees nothing (AC-09).
  const clinicianContext = await browser.newContext();
  const clinician = await clinicianContext.newPage();
  await signIn(clinician, "demo.clinician@example.com");
  await expect(clinician).toHaveURL(/\/clinician\/patients$/);
  await expect(clinician.getByText("Nothing shared yet")).toBeVisible();
  const hidden = await clinician.goto(`/clinician/reports/${reportId}`);
  expect(hidden?.status()).toBe(404);

  // Share it (AC-10).
  await page.getByLabel(/I've checked this report/).check();
  await page.getByRole("button", { name: "Share report" }).click();
  await expect(page.getByText(/Shared with Dr Sam Taylor/)).toBeVisible();
  const consents = await db.execute<{ scope: Record<string, string> }>(sql`select scope from consents where purpose = 'clinician_sharing' and status = 'granted'`);
  expect(consents.some((consent) => consent.scope.reportId === reportId)).toBe(true);

  await clinician.goto(`/clinician/reports/${reportId}`);
  await expect(clinician.getByRole("heading", { name: "Shared report: Alex Rivera" })).toBeVisible();
  await expect(clinician.getByText(/“Morning walk”: \d+ of \d+ sessions done/)).toBeVisible();
  await clinician.getByRole("button", { name: "Mark as reviewed" }).click();
  await expect(clinician.getByText("You marked this report as reviewed.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/reviewed/)).toBeVisible();

  // Another patient can't open Alex's report (AC-16).
  const otherContext = await browser.newContext();
  const priya = await otherContext.newPage();
  await signIn(priya, "demo.patient2@example.com");
  await expect(priya).toHaveURL(/\/dashboard$/);
  expect((await priya.goto(`/care-sharing/${reportId}`))?.status()).toBe(404);

  // Revoke: the clinician loses access immediately.
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByRole("button", { name: "Share report" })).toBeVisible();
  expect((await clinician.goto(`/clinician/reports/${reportId}`))?.status()).toBe(404);

  await clinicianContext.close();
  await otherContext.close();
});

test("export and permanent account deletion", async ({ page }) => {
  const account = await createConfirmedUser("e2e.delete");
  let deleted = false;
  try {
    await signIn(page, account.email);
    await completeOnboarding(page);
    const userId = await appUserId(account.authUserId);
    await createGoal(userId, { title: "Walk", category: "walk", cadence: "weekly", targetCount: 3, daysOfWeek: null, times: [], durationMinutes: null, notes: null }, { type: "patient" });

    // Give the account a shared report, so deletion has to clean up consents and shares too.
    const [clinician] = await db.execute<{ id: string }>(sql`select id from users where display_name = 'Dr Sam Taylor'`);
    await db.execute(sql`insert into clinician_relationships (patient_id, clinician_id, status) values (${userId}, ${clinician.id}, 'active')`);
    await setConsent(userId, "health_data_processing", true);
    const reportId = await createReport(userId, "Australia/Adelaide", 2, ["goals"]);
    await shareReport(userId, reportId, clinician.id);

    const exported = await page.request.get("/api/me/export");
    expect(exported.headers()["content-disposition"]).toContain("attachment");
    const data = await exported.json();
    expect(data.user.id).toBe(userId);
    expect(data.goals.map((goal: { title: string }) => goal.title)).toEqual(["Walk"]);

    await page.goto("/settings/privacy");
    await page.getByRole("button", { name: "Delete my account and data" }).click();
    await expect(page.getByText("Type DELETE to confirm.", { exact: true })).toBeVisible();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Delete my account and data" }).click();
    await expect(page.getByText("Your account and data have been deleted.")).toBeVisible();
    deleted = true;

    expect(await db.execute(sql`select 1 from users where id = ${userId}`)).toHaveLength(0);
    expect(await db.execute(sql`select 1 from goals where user_id = ${userId}`)).toHaveLength(0);
    expect(await db.execute(sql`select 1 from reports where id = ${reportId}`)).toHaveLength(0);
    expect(await db.execute(sql`select 1 from report_shares where report_id = ${reportId}`)).toHaveLength(0);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    if (!deleted) await deleteUser(account.authUserId);
  }
});

