import "server-only";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { createDatabase } from "./database";

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function migrateDatabase(db: ReturnType<typeof createDatabase>["db"]) {
  return migrate(db, { migrationsFolder });
}
