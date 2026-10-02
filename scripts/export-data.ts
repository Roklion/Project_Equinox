import nextEnv from "@next/env";
import { open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createExportService } from "../src/application/export";
import { validateExportBundle } from "../src/domain/portability/bundle";
import { createDatabase } from "../src/persistence/database";
import { readDatabaseUrl } from "../src/persistence/environment";
import { createPostgresExportRepository } from "../src/persistence/export";

nextEnv.loadEnvConfig(process.cwd(), true);

async function main() {
  const [command, first, second, ...extra] = process.argv.slice(2);
  if (command === "validate" && first && !second) {
    const findings = validateExportBundle(JSON.parse(await readFile(resolve(first), "utf8")));
    if (findings.length) throw new Error("Invalid export.");
    console.info("Canonical export is valid.");
    return;
  }
  if (command !== "export" || !first || !second || extra.length) throw new Error("Invalid arguments.");
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(first)) throw new Error("Invalid household.");
  const destination = resolve(second);
  // Private artifacts must remain outside this public checkout, even if ignored.
  const within = relative(process.cwd(), destination);
  if (!isAbsolute(within) && within !== ".." && !within.startsWith("..\\") && !within.startsWith("../")) throw new Error("Private destination required.");
  const { db, pool } = createDatabase(readDatabaseUrl());
  try {
    const content = await createExportService(createPostgresExportRepository(db)).exportHousehold(first);
    // Exclusive creation preserves an existing file. Clean up only our own incomplete write.
    const file = await open(destination, "wx", 0o600);
    try { await file.writeFile(content, "utf8"); }
    catch (error) { await file.close(); await unlink(destination); throw error; }
    await file.close();
    const { data } = JSON.parse(content);
    console.info(`Export saved to ${destination}. ${data.investments.length} investments, ${data.actions.length} actions, ${data.marks.length} valuations.`);
  } finally { await pool.end(); }
}

main().catch(() => {
  // Driver/JSON errors can include private values; never print them.
  console.error("Export command failed. Use: npm run data:export -- export <household-id> <private-path-outside-checkout> | validate <bundle-path>. Check the database, destination permissions, file existence, and bundle integrity.");
  process.exitCode = 1;
});
