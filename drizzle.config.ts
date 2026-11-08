import { defineConfig } from "drizzle-kit";
import { loadEnvFiles } from "./lib/env-files";

loadEnvFiles();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});
