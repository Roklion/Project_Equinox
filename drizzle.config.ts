import { defineConfig } from "drizzle-kit";

// Generating SQL does not need a running database or credentials.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/persistence/schema.ts",
  out: "./drizzle",
});
