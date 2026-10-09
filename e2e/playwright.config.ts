import { defineConfig, devices } from "@playwright/test";

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const CI = Boolean(process.env.CI);
const WEBKIT_WORKERS = CI ? 1 : undefined;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["list"], ["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"], workers: WEBKIT_WORKERS },
    { name: "mobile-safari", use: devices["iPhone 15"], workers: WEBKIT_WORKERS },
  ],

  // Servers are assumed running locally. E2E_START_SERVERS=1 makes Playwright build and boot them (CI).
  webServer: process.env.E2E_START_SERVERS
    ? [
        {
          command: "pnpm --filter web build && pnpm --filter web start",
          url: WEB_URL,
          timeout: 180_000,
          reuseExistingServer: !CI,
        },
      ]
    : undefined,
});
