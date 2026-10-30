import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Desktop Chrome"],
    launchOptions: { channel: "chrome" },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-local-ready.mjs",
    url: "http://127.0.0.1:4173/api/v1/auth/csrf",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
