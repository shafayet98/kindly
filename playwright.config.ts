import { defineConfig, devices } from "@playwright/test";
import { assertTestProject, loadEnvFiles } from "./lib/env-files";

// End-to-end tests run against a separate test Supabase project (.env.test on top of .env), never the
// live one: they reset demo data, and the live phone server would dial calls they create. Local only.
process.env.KINDLY_ENV = "test";
loadEnvFiles();
assertTestProject();
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        permissions: ["microphone"],
        timezoneId: "Australia/Adelaide",
        // A synthetic microphone so browser voice calls can run headless.
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
    },
  ],
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: false, timeout: 120_000 },
});
