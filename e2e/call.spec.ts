import { expect, test } from "@playwright/test";
import { appUserId, createConfirmedUser, db, deleteUser, signIn, sql } from "./helpers";

test("browser call: agent speaks, UI switch keeps the same session, end call is recorded (AC-01, AC-02, AC-05)", async ({ page }) => {
  await signIn(page, "demo.patient@example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/call?agent=milo");
  await page.getByRole("button", { name: "Start talking to Milo" }).click();
  await expect(page.getByText(/Milo is speaking|Listening/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Talk to Sarah" }).click();
  await expect(page.getByRole("heading", { name: "Sarah" })).toBeVisible();
  await expect(page.getByText(/Sarah is speaking|Listening/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "End call" }).click();
  await expect(page.getByText("Call ended")).toBeVisible();

  // One session, ended, with a UI handoff from Milo to Sarah.
  await expect
    .poll(async () => {
      const [session] = await db.execute<{ id: string; state: string; active_agent: string }>(
        sql`select s.id, s.state, s.active_agent from call_sessions s join users u on u.id = s.user_id
            where u.display_name = 'Alex Rivera' and s.channel = 'browser' order by s.started_at desc limit 1`,
      );
      const events = await db.execute<{ event_type: string; structured_payload: Record<string, unknown> }>(
        sql`select event_type, structured_payload from agent_events where session_id = ${session.id} order by at`,
      );
      return { state: session.state, agent: session.active_agent, events: events.map((event) => `${event.event_type}:${event.structured_payload.via ?? ""}`) };
    })
    .toEqual({ state: "ended", agent: "sarah", events: ["session_started:", "handoff:ui", "session_ended:"] });
});

test.describe("voice API security", () => {
  test("rejects signed-out, cross-site and cross-account requests (AC-16, AC-17, AC-28)", async ({ page, request, baseURL }) => {
    // Signed out.
    const anonymous = await request.post("/api/voice/session", { data: { agent: "milo" }, headers: { Origin: baseURL! } });
    expect(anonymous.status()).toBe(401);

    // Alex's latest session id.
    const [alexSession] = await db.execute<{ id: string }>(
      sql`select s.id from call_sessions s join users u on u.id = s.user_id where u.display_name = 'Alex Rivera' order by s.started_at desc limit 1`,
    );

    // Another patient (Priya) cannot use Alex's session, whatever the model or client claims.
    await signIn(page, "demo.patient2@example.com");
    await expect(page).toHaveURL(/\/dashboard$/);
    const crossAccount = await page.request.post("/api/voice/tools", {
      data: { sessionId: alexSession.id, agent: "milo", name: "get_reminders", input: { userId: "anything" } },
      headers: { Origin: baseURL! },
    });
    expect(crossAccount.status()).toBe(404);

    // Cross-site requests are refused even with a valid cookie.
    const crossSite = await page.request.post("/api/voice/session", { data: { agent: "milo" }, headers: { Origin: "https://evil.example" } });
    expect(crossSite.status()).toBe(403);
  });

  test("browser voice needs its own consent (AC-24, AC-30)", async ({ page, baseURL }) => {
    const account = await createConfirmedUser("e2e.voiceconsent");
    try {
      await signIn(page, account.email);
      await page.getByRole("button", { name: "Skip for now" }).click();
      await expect(page.getByRole("heading", { name: "Want to start with one small goal?" })).toBeVisible();
      await page.getByRole("button", { name: "Skip for now" }).click();
      await page.getByRole("button", { name: "Finish and go to my dashboard" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      const denied = await page.request.post("/api/voice/session", { data: { agent: "natalie" }, headers: { Origin: baseURL! } });
      expect(denied.status()).toBe(403);
      expect((await denied.json()).error).toBe("consent_required");

      await page.goto("/call");
      await page.getByRole("button", { name: "Allow browser voice" }).click();
      await expect(page.getByRole("button", { name: /Start talking to/ })).toBeVisible();
      const userId = await appUserId(account.authUserId);
      const consents = await db.execute<{ purpose: string }>(sql`select purpose from consents where user_id = ${userId} and status = 'granted'`);
      expect(consents.map((row) => row.purpose)).toEqual(["browser_voice"]);
    } finally {
      await deleteUser(account.authUserId);
    }
  });
});
