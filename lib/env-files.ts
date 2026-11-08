import { existsSync, readFileSync } from "node:fs";
import { config, parse } from "dotenv";
import { isFictionalNumber } from "./telephony/phone";

/**
 * Loads .env and, when KINDLY_ENV=test, .env.test on top of it (the separate test Supabase project).
 * Outside test mode, variables already in the environment win, so hosted settings are never
 * overridden. In test mode .env.test always wins: some tools (drizzle-kit) load .env by themselves.
 */
export function loadEnvFiles() {
  if (process.env.KINDLY_ENV === "test") {
    if (!existsSync(".env.test")) throw new Error("KINDLY_ENV=test needs a .env.test file for the test Supabase project. See CONTRIBUTING.md.");
    config({ path: ".env.test", quiet: true, override: true });
  }
  config({ path: ".env", quiet: true });
}

/**
 * Stops tests from running against the live project: they reset demo data and create calls that the
 * live phone server would dial. Throws unless the test settings point somewhere else.
 */
export function assertTestProject() {
  const live = existsSync(".env") ? parse(readFileSync(".env")) : {};
  const problems: string[] = [];
  if (process.env.KINDLY_ENV !== "test") problems.push("KINDLY_ENV is not set to test");
  for (const key of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
    if (!process.env[key]) problems.push(`${key} is missing`);
    else if (process.env[key] === live[key]) problems.push(`${key} in .env.test is the same as in .env`);
  }
  const demoNumber = process.env.DEMO_CALL_TO_NUMBER;
  if (demoNumber && !isFictionalNumber(demoNumber)) problems.push("DEMO_CALL_TO_NUMBER must be a fictional number such as +61491570006");
  if (problems.length) throw new Error(`Tests must use the separate test Supabase project (.env.test): ${problems.join("; ")}. See CONTRIBUTING.md.`);
}
