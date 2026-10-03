import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3100";
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:" + port, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: ["desktop.spec.ts", "navigation.spec.ts", "historical-charts.spec.ts", "investment-management.spec.ts", "investments.spec.ts", "action-context.spec.ts", "overview-updates.spec.ts", "product-regression.spec.ts"] },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: ["iphone.spec.ts", "navigation.spec.ts", "historical-charts.spec.ts", "investment-management.spec.ts", "investments.spec.ts", "action-context.spec.ts", "overview-updates.spec.ts", "product-regression.spec.ts"] },
  ],
  webServer: {
    command: "node --conditions=react-server --import tsx scripts/e2e-server.ts",
    url: "http://localhost:" + port + "/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
