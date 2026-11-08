import { defineConfig } from "drizzle-kit";
import { assertTestProject, loadEnvFiles } from "./lib/env-files";

loadEnvFiles();
// test:db:migrate must only ever reach the test project.
if (process.env.KINDLY_ENV === "test") assertTestProject();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});
