import { expect, test } from "@playwright/test";
import { runTool } from "@/lib/agents/tools/run";
import { enablePhoneCalls } from "@/lib/calls/settings";
import { createGoal } from "@/lib/goals/service";
import { ensureAppUserForScript } from "../scripts/script-users";
import { createConfirmedUser, db, deleteUser, signIn, sql } from "./helpers";

async function alexId() {
  const [row] = await db.execute<{ id: string }>(sql`select id from users where display_name = 'Alex Rivera'`);
  return row.id;
}

test("a goal typed in plain words gets a category and shows on the calendar with its reminder", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/goals");

  const add = page.getByRole("region", { name: "Add a goal" });
  await add.getByLabel("What would you like to do?").fill("Swim 2 days a week");
  await add.getByRole("button", { name: "Continue" }).click();
  // Checked by the AI, then by the person.
  await expect(page.getByText("Here's what we understood")).toBeVisible({ timeout: 30_000 });
  await expect(add.getByLabel("Category")).toHaveValue("workout");
  await expect(add.getByRole("radio", { name: "Weekly" })).toBeChecked();
  await add.getByText("Tue", { exact: true }).click();
  await add.getByText("Sat", { exact: true }).click();
  await add.getByLabel("Time 1").fill("07:30");
  await add.getByLabel("Reminder").selectOption("in_app");
  await add.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByText("Goal saved.")).toBeVisible();

  const goal = page.getByRole("article").filter({ hasText: /Swim/ });
  await expect(goal).toContainText("Tue, Sat · 7:30 AM");
  await expect(goal).toContainText("In-app reminder at 7:30 AM");
  const [row] = await db.execute<{ category: string; cadence: string; target_count: number }>(sql`select category, cadence, target_count from goals where user_id = ${await alexId()} and title ilike '%swim%'`);
  expect(row).toEqual({ category: "workout", cadence: "weekly", target_count: 2 });

  await page.goto("/dashboard?week=" + new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  await expect(page.getByRole("button", { name: /Swim.*7:30 AM/ })).toHaveCount(2);
});

test("calendar sessions can be marked done, moved just once, and undone", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  const today = page.locator('li[aria-current="date"]');
  const tablet = today.getByRole("button", { name: /Take blood pressure tablet/ }).first();
  await expect(tablet).toContainText("Planned");

  // Details explain the plan and its reminder.
  await tablet.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Medication");
  await expect(dialog).toContainText("Every day · 8:00 AM");
  await expect(dialog).toContainText("In the app at 8:00 AM");
  await dialog.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Marked as done.")).toBeVisible();
  await expect(tablet).toContainText("Done");

  await tablet.click();
  await dialog.getByRole("button", { name: "Undo done" }).click();
  await expect(tablet).toContainText("Planned");

  // Move today's tablet to this evening.
  await tablet.click();
  await dialog.getByRole("button", { name: "Move this one" }).click();
  await dialog.getByLabel("Time").fill("21:00");
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText("Moved, just this once.")).toBeVisible();
  await expect(today.getByRole("button", { name: /Take blood pressure tablet.*8:00 AM.*Moved/ })).toBeVisible();
  await expect(today.getByRole("button", { name: /Take blood pressure tablet.*9:00 PM/ })).toBeVisible();

  await today.getByRole("button", { name: /Take blood pressure tablet.*8:00 AM.*Moved/ }).click();
  await dialog.getByRole("button", { name: "Undo move" }).click();
  await expect(today.getByRole("button", { name: /Take blood pressure tablet.*9:00 PM/ })).toHaveCount(0);
});

test("goals counted per week can be logged from the calendar", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  const pushups = page.getByRole("list", { name: "Goals counted per week or month" }).getByRole("listitem").filter({ hasText: "30 push-ups" });
  const before = Number((await pushups.textContent())?.match(/(\d+) of 2 this week/)?.[1]);
  await pushups.getByRole("button", { name: "Did one today" }).click();
  await expect(pushups).toContainText(`${before + 1} of 2 this week`);
  await expect(page.getByRole("list", { name: "Goals counted per week or month" }).getByText(/Try a new healthy recipe · \d of 2 this month/)).toBeVisible();
});

test("a flexible weekly goal's reminder shows on the days it rings", async ({ page }) => {
  const userId = await alexId();
  const [goal] = await db.execute<{ id: string; timezone: string }>(
    sql`select g.id, u.timezone from goals g join users u on u.id = g.user_id where g.user_id = ${userId} and g.title = '30 push-ups' and g.ends_on is null`,
  );
  const [reminder] = await db.execute<{ id: string }>(
    sql`insert into reminders (user_id, goal_id, title, local_time, days_of_week, timezone, channel) values (${userId}, ${goal.id}, '30 push-ups', '17:00', '{2,4}', ${goal.timezone}, 'in_app') returning id`,
  );
  try {
    await signIn(page, "demo.patient@example.com");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard?week=" + new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    const days = page.getByRole("main").locator("li").filter({ has: page.getByText("Reminder · 30 push-ups · 5:00 PM") });
    await expect(days).toHaveCount(2);
    await expect(days.nth(0)).toContainText("Tuesday");
    await expect(days.nth(1)).toContainText("Thursday");

    await page.goto("/goals");
    await expect(page.getByRole("article").filter({ hasText: "30 push-ups" })).toContainText("In-app reminder at 5:00 PM · Tue, Thu");
  } finally {
    await db.execute(sql`delete from reminders where id = ${reminder.id}`);
  }
});

test("days picked with Natalie for an 'any days' goal's reminder become the goal's days, and calls are checked first", async () => {
  const account = await createConfirmedUser("e2e.days");
  try {
    const userId = await ensureAppUserForScript(account.authUserId);
    await db.execute(sql`update users set timezone = 'Australia/Adelaide' where id = ${userId}`);
    const goal = await createGoal(userId, { title: "Exercise", category: "workout", cadence: "weekly", targetCount: 3, daysOfWeek: null, times: ["18:30"], durationMinutes: null, notes: null }, { type: "patient" });
    const ctx = { userId, sessionId: null, agent: "natalie" as const, channel: "browser" as const, timezone: "Australia/Adelaide" };
    const ask = { title: "Exercise", time: "18:30", days: [1, 3, 5], delivery: "phone", goal_id: goal.id };

    // Phone calls are off: refused before the person is asked to agree.
    const refused = await runTool(ctx, "propose_new_reminder", ask);
    expect(refused).toMatchObject({ ok: true, result: { error: expect.stringContaining("phone calls turned on first") } });
    const [{ count }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from action_confirmations where user_id = ${userId}`);
    expect(count).toBe(0);

    await enablePhoneCalls(userId, "+61491570158");
    const proposed = await runTool(ctx, "propose_new_reminder", ask);
    if (!proposed.ok) throw new Error(proposed.error);
    expect(proposed.result.summary).toContain("“Exercise” will then be planned for Mon, Wed, Fri at 6:30 PM");
    const confirmed = await runTool(ctx, "confirm_action", { confirmation_id: proposed.result.confirmation_id });
    expect(confirmed).toMatchObject({ ok: true, result: { done: true } });

    const [after] = await db.execute<{ id: string; days_of_week: number[]; target_count: number }>(sql`select id, days_of_week, target_count from goals where user_id = ${userId} and ends_on is null`);
    expect(after).toMatchObject({ days_of_week: [1, 3, 5], target_count: 3 });
    const [reminder] = await db.execute<{ goal_id: string; days_of_week: number[]; local_time: string }>(sql`select goal_id, days_of_week, local_time from reminders where user_id = ${userId}`);
    expect(reminder).toEqual({ goal_id: after.id, days_of_week: [1, 3, 5], local_time: "18:30" });
  } finally {
    await deleteUser(account.authUserId);
  }
});

test("progress shows each week by category, and where patterns and changes came from", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("region", { name: "Main actions" }).getByRole("link", { name: /Progress/ }).click();
  await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
  await expect(page.getByText("What you reported")).toHaveCount(0);

  // The week the shifts changed: walks missed on Monday and Wednesday.
  const weeks = page.locator("details");
  const stressWeek = weeks.nth(2);
  await stressWeek.locator("summary").click();
  const walks = stressWeek.getByRole("list", { name: "Walk sessions" });
  await expect(walks.getByText("Not done", { exact: true })).toHaveCount(2);
  await expect(walks.getByText("Done", { exact: true })).toHaveCount(1);

  // Last week's Wednesday walk was moved to Thursday evening.
  const lastWeek = weeks.nth(1);
  await lastWeek.locator("summary").click();
  await expect(lastWeek.getByText(/moved to Thu/)).toBeVisible();
  await expect(lastWeek.getByText("Postponed", { exact: true })).toBeVisible();

  const patterns = page.getByRole("region", { name: "Patterns worth a chat" });
  await expect(patterns).toContainText("Stressed after the roster change");
  await expect(patterns).toContainText("Based on the conversation with Natalie on Wednesday 7:00 pm");

  const changes = page.getByRole("region", { name: "Plan changes you approved" });
  await expect(changes).toContainText("“Morning walk”: 30 min → 20 min");
  await expect(changes).toContainText("You asked Natalie on Sunday 2:00 pm: “my evening shifts changed and I'm wiped out”");
});

test("conversation summaries are shown only to the person and can be deleted", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/activity");
  const sunday = page.getByRole("region").filter({ hasText: "You agreed to shorter walks" });
  await expect(sunday).toContainText("Only you can see this");
  await sunday.getByRole("button", { name: "Delete summary" }).click();
  await expect(page.getByText("You agreed to shorter walks")).toHaveCount(0);

  await page.goto("/settings/privacy");
  await expect(page.getByText("Include chats with Sarah in summaries")).toBeVisible();
  await page.getByRole("switch", { name: "Conversation summaries" }).uncheck({ force: true });
  await expect(page.getByText("Include chats with Sarah in summaries")).toHaveCount(0);
  await page.goto("/activity");
  await expect(page.getByText("Conversation summaries are off.")).toBeVisible();
});
