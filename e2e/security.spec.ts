import { expect, test } from "@playwright/test";
import { runTool } from "@/lib/agents/tools/run";
import { db, sql } from "./helpers";

test("tool calls ignore identities injected into model arguments (AC-17)", async () => {
  const [alex] = await db.execute<{ id: string; timezone: string }>(sql`select id, timezone from users where display_name = 'Alex Rivera'`);
  const [priya] = await db.execute<{ id: string }>(sql`select id from users where display_name = 'Priya Shah'`);
  const ctx = { userId: alex.id, sessionId: null, agent: "milo" as const, channel: "browser" as const, timezone: alex.timezone };

  const outcome = await runTool(ctx, "get_reminders", { userId: priya.id, user_id: priya.id, all_users: true });
  expect(outcome.ok).toBe(true);
  const reminders = outcome.ok ? (outcome.result.reminders as { id: string }[]) : [];
  const owners = await db.execute<{ user_id: string }>(sql`select distinct user_id from reminders where id in ${reminders.map((r) => r.id)}`);
  expect(owners.map((row) => row.user_id)).toEqual([alex.id]);

  expect(await runTool(ctx, "drop_all_tables", {})).toEqual({ ok: false, error: "Unknown tool." });
  expect((await runTool(ctx, "save_wellbeing_note", { note: "x" })).ok).toBe(false); // not Milo's tool
  expect(await runTool(ctx, "propose_reminder_change", { reminder_id: "'; drop table reminders; --", action: "cancel", new_time: null, days: null })).toEqual({
    ok: true,
    result: { error: "No such reminder. Call get_reminders to find the right one." },
  });
});

test("security headers are set", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["permissions-policy"]).toContain("microphone=(self)");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
