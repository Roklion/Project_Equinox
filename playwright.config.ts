import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: "desktop.spec.ts" },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: "iphone.spec.ts" },
  ],
  webServer: {
    command: "node --conditions=react-server --import tsx scripts/e2e-server.ts",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
