import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

// Test mode follows Next.js conventions: .env.test.local, never .env.local.
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["src/**/*.integration.test.ts"],
    exclude: [],
    hookTimeout: 30_000,
  },
});
