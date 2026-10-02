import { spawnSync } from "node:child_process";

// Each viewport gets its own newly migrated database and server lifecycle.
for (const device of ["desktop", "iphone"]) {
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.bootstrap.config.ts"], {
    stdio: "inherit", env: { ...process.env, E2E_DEVICE: device },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
