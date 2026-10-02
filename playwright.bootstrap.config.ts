import { defineConfig, devices } from "@playwright/test";

const device = process.env.E2E_DEVICE ?? "desktop";
const port = process.env.E2E_PORT ?? "3102";
export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/bootstrap-" + device,
  testMatch: "bootstrap.spec.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:" + port, trace: "retain-on-failure" },
  projects: [{ name: device, use: device === "iphone" ? { ...devices["iPhone 13"], browserName: "chromium" } : { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --conditions=react-server --import tsx scripts/e2e-server.ts",
    url: "http://localhost:" + port + "/login",
    env: { E2E_EMPTY: "1", E2E_PORT: port },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
