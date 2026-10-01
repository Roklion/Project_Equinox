import { defineConfig, devices } from "@playwright/test";

// Pure presentation fixtures need neither authentication nor a database.
export default defineConfig({
  testDir: "./e2e/presentation", fullyParallel: true, reporter: "list",
  globalSetup: "./e2e/presentation/setup.ts",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
