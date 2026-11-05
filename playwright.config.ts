import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: ".env", quiet: true });

// End-to-end tests run against the real Supabase project with fictional demo accounts.
// They need .env, so they run locally (pnpm test:e2e), not in CI.
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
        // A synthetic microphone so browser voice calls can run headless.
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
    },
  ],
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
