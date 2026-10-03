import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { runMigrationCli } from "./cli";
import * as reports from "./cli-report";
import targetMapping from "./testing/synthetic-target-mapping.json";
import { createDatabase } from "@/persistence/database";
import { readDatabaseUrl } from "@/persistence/environment";
import { migrateDatabase } from "@/persistence/migrate";
import { households, owners, investments, movements } from "@/persistence/schema";
vi.mock("server-only", () => ({}));
const name = `equinox_test_${randomUUID().replaceAll("-", "")}`;
let admin: Client | undefined;
let db: ReturnType<typeof createDatabase> | undefined;
let created = false;
let dir: string;
let url: string;
beforeAll(async () => {
  const maintenance = readDatabaseUrl("TEST_DATABASE_URL");
  const target = new URL(maintenance);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("Local disposable database required.");
  admin = new Client({ connectionString: maintenance }); await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  target.pathname = `/${name}`; url = target.toString();
  db = createDatabase(url); await migrateDatabase(db.db);
  dir = await mkdtemp(join(tmpdir(), "equinox-cli-db-"));
  const [home] = await db.db.insert(households).values({ name: "Synthetic CLI household" }).returning();
  const [a, b] = await db.db.insert(owners).values([{ householdId: home.id, name: "Synthetic A" }, { householdId: home.id, name: "Synthetic B" }]).returning();
  await writeFile(join(dir, "mapping.json"), JSON.stringify({ ...targetMapping, householdId: home.id, owners: { "owner-a": a.id, "owner-b": b.id } }));
});
afterAll(async () => {
  try { await db?.pool.end(); if (created) await admin?.query(`DROP DATABASE "${name}"`); }
  finally { await admin?.end(); if (dir) await rm(dir, { recursive: true, force: true }); }
});
function args(command: string) {
  return [command, "--workbook", resolve("src/migration/testing/synthetic.xlsx"), "--adapter", resolve("src/migration/testing/synthetic-mapping.json"), "--mapping", join(dir, "mapping.json"), "--output", join(dir, `${command}.json`),
    ...(command === "apply" ? ["--backup-confirmed"] : []), ...(command === "reconcile" ? ["--manifest", join(dir, "apply.json")] : [])];
}
it("CLI runs dry preflight, atomic apply, manifest-based reconciliation and repeat rejection on disposable PostgreSQL", async () => {
  const log = vi.fn(); const config = { env: { MIGRATION_DATABASE_URL: url }, log };
  expect(await runMigrationCli(args("preflight"), config)).toBe(0);
  expect(await db!.db.select().from(investments)).toHaveLength(0);
  expect(await runMigrationCli(args("apply"), config)).toBe(0);
  const manifest = JSON.parse(await readFile(join(dir, "apply.json"), "utf8"));
  expect(Object.keys(manifest.ids)).toHaveLength(15);
  expect(await db!.db.select().from(investments)).toHaveLength(3);
  expect(await db!.db.select().from(movements)).toHaveLength(7);
  expect(await runMigrationCli(args("reconcile"), config)).toBe(0);
  const report = JSON.parse(await readFile(join(dir, "reconcile.json"), "utf8"));
  expect(report.results).toHaveLength(9); expect(report.results.every((r: { status: string }) => r.status === "match")).toBe(true);
  expect(report.results.find((r: { measure: string }) => r.measure === "nav")).toMatchObject({ equinox: { status: "available", value: "85.00" } });
  // A synthetic one-cent source discrepancy must remain visible with exit code 2.
  const adapter = JSON.parse(await readFile(resolve("src/migration/testing/synthetic-mapping.json"), "utf8"));
  const expectationSection = adapter.sheets.find((s: { kind: string }) => s.kind === "expectation");
  expectationSection.lastRow = expectationSection.firstRow;
  expectationSection.fields.expected = { value: "94.01" };
  await writeFile(join(dir, "different-adapter.json"), JSON.stringify(adapter));
  const differentArgs = args("reconcile");
  differentArgs[differentArgs.indexOf("--adapter") + 1] = join(dir, "different-adapter.json");
  differentArgs[differentArgs.indexOf("--output") + 1] = join(dir, "different-report.json");
  expect(await runMigrationCli(differentArgs, config)).toBe(2);
  expect(JSON.parse(await readFile(join(dir, "different-report.json"), "utf8")).results).toMatchObject([{ status: "mapping_mismatch", difference: "-0.01" }]);
  // A target mismatch must fail before comparison; a rehearsal manifest is not portable.
  const wrongManifest = { ...manifest, householdId: randomUUID() };
  await writeFile(join(dir, "wrong-manifest.json"), JSON.stringify(wrongManifest));
  differentArgs[differentArgs.indexOf("--manifest") + 1] = join(dir, "wrong-manifest.json");
  differentArgs[differentArgs.indexOf("--output") + 1] = join(dir, "wrong-report.json");
  expect(await runMigrationCli(differentArgs, config)).toBe(1);
  // Separate scopes must not hide duplicate investment identities in a recovered manifest.
  const duplicateManifest = { ...manifest, ids: { ...manifest.ids, "i-b": manifest.ids["i-a"] } };
  await writeFile(join(dir, "duplicate-manifest.json"), JSON.stringify(duplicateManifest));
  differentArgs[differentArgs.indexOf("--manifest") + 1] = join(dir, "duplicate-manifest.json");
  differentArgs[differentArgs.indexOf("--output") + 1] = join(dir, "duplicate-report.json");
  expect(await runMigrationCli(differentArgs, config)).toBe(1);
  await expect(readFile(join(dir, "duplicate-report.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await rm(join(dir, "apply.json"));
  expect(await runMigrationCli(args("apply"), config)).toBe(1);
  expect(await db!.db.select().from(investments)).toHaveLength(3); expect(await db!.db.select().from(movements)).toHaveLength(7);
  const output = log.mock.calls.flat().join("\n"); expect(output).not.toContain(url); expect(output).not.toContain("85.00");
});



it("reports commit truthfully and retains its private output when manifest writing fails after apply", async () => {
  const [home] = await db!.db.insert(households).values({ name: "Synthetic output failure" }).returning();
  const [a, b] = await db!.db.insert(owners).values([{ householdId: home.id, name: "Synthetic A" }, { householdId: home.id, name: "Synthetic B" }]).returning();
  const mappingPath = join(dir, "failure-mapping.json");
  await writeFile(mappingPath, JSON.stringify({ ...targetMapping, householdId: home.id, owners: { "owner-a": a.id, "owner-b": b.id } }));
  const output = join(dir, "failure-manifest.json");
  const invocation = args("apply"); invocation[invocation.indexOf("--mapping") + 1] = mappingPath; invocation[invocation.indexOf("--output") + 1] = output;
  const reserve = reports.reservePrivateReport;
  const spy = vi.spyOn(reports, "reservePrivateReport").mockImplementation(async (path, cwd) => {
    const file = await reserve(path, cwd);
    return { ...file, save: async () => { throw new Error("synthetic-private-driver-text"); } };
  });
  const log = vi.fn();
  try {
    expect(await runMigrationCli(invocation, { env: { MIGRATION_DATABASE_URL: url }, log })).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain("apply_committed_report_failed");
    expect(log.mock.calls.flat().join("\n")).not.toContain("synthetic-private-driver-text");
    expect(await readFile(output, "utf8")).toBe("");
    expect(await db!.db.select().from(investments)).toHaveLength(6);
    // The retained output is closed; it can be removed normally on Windows too.
    await rm(output);
  } finally { spy.mockRestore(); }
});
