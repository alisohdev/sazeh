import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/online",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5187",
    ...devices["Desktop Chrome"],
    launchOptions: { channel: "msedge" },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @sazeh/web exec vite --host 127.0.0.1 --port 5187",
    url: "http://127.0.0.1:5187",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
