import ExcelJS from "exceljs";
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { runMigrationCli, type CliConnection } from "./cli";
import { reservePrivateReport } from "./cli-report";
import { readImportMapping, readManifest, readRules, countKeys } from "./cli-config";
import { parseWorkbook, readWorkbookMapping } from "./spreadsheet";
import { migrationInvestmentId } from "@/application/migration";
import targetMapping from "./testing/synthetic-target-mapping.json";
vi.mock("server-only", () => ({}));
const id = "00000000-0000-4000-8000-000000000001";
const input = { mapping: { ...targetMapping, owners: { "owner-a": id, "owner-b": id } } };
let dir: string;
let log: Mock<(message: string) => void>;
let catalog: Mock<CliConnection["migration"]["catalog"]>;
let transaction: Mock<() => Promise<never>>;
let close: Mock<CliConnection["close"]>;
let connection: CliConnection;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "equinox-cli-")); log = vi.fn(); close = vi.fn().mockResolvedValue(undefined); transaction = vi.fn(async () => { throw new Error("unexpected_write"); });
  catalog = vi.fn().mockResolvedValue({ exists: true, householdId: id, ownerIds: [id], classificationIds: {}, classifications: [], investments: [] });
  connection = { migration: { catalog, transaction }, analytics: {} as CliConnection["analytics"], close };
  await writeFile(join(dir, "mapping.json"), JSON.stringify(input.mapping));
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
function args(command: string, output = join(dir, "report.json")) {
  return [command, "--workbook", resolve("src/migration/testing/synthetic.xlsx"), "--adapter", resolve("src/migration/testing/synthetic-mapping.json"), "--output", output,
    ...(command === "inspect" ? [] : ["--mapping", join(dir, "mapping.json")]), ...(command === "apply" ? ["--backup-confirmed"] : [])];
}
const config = () => ({ log, env: { MIGRATION_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1/synthetic" }, connect: vi.fn(() => connection) });
it("inspects the synthetic workbook without opening a database", async () => {
  const c = config(); expect(await runMigrationCli(args("inspect"), c)).toBe(0); expect(c.connect).not.toHaveBeenCalled();
  const report = JSON.parse(await readFile(join(dir, "report.json"), "utf8"));
  expect(report.dataset.records).toHaveLength(15); expect(report.dataset.expectations).toHaveLength(9);
  expect(log.mock.calls.flat().join("\n")).not.toContain("Synthetic Amber");
});
it("preflight is non-mutating and emits a private plan", async () => {
  expect(await runMigrationCli(args("preflight"), config())).toBe(0); expect(transaction).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
  expect(JSON.parse(await readFile(join(dir, "report.json"), "utf8"))).toMatchObject({ findings: [], counts: { investments: 3, transfers: 1, valuations: 6 } });
});
it("blocked apply saves findings and never starts a write transaction", async () => {
  catalog.mockResolvedValue({ exists: true, householdId: id, ownerIds: [], classificationIds: {}, classifications: [], investments: [] });
  expect(await runMigrationCli(args("apply"), config())).toBe(1); expect(transaction).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(join(dir, "report.json"), "utf8"))).toMatchObject({ findings: expect.arrayContaining([expect.objectContaining({ code: "unresolved_owner", sourceKey: "i-a" })]) });
});
it("never falls back to DATABASE_URL or TEST_DATABASE_URL", async () => {
  const c = { ...config(), env: { DATABASE_URL: "postgresql://secret/production", TEST_DATABASE_URL: "postgresql://secret/test" } };
  expect(await runMigrationCli(args("preflight"), c)).toBe(1); expect(c.connect).not.toHaveBeenCalled();
  expect(log.mock.calls.flat().join("\n")).not.toContain("secret");
});
it("requires explicit apply and backup acknowledgement and rejects accidental flags", async () => {
  for (const a of [args("apply").slice(0, -1), [...args("inspect"), "--apply"], [...args("preflight"), "--output", join(dir, "other.json")]]) {
    const c = config(); expect(await runMigrationCli(a, c)).toBe(1); expect(c.connect).not.toHaveBeenCalled();
  }
});
it("sanitizes malformed JSON and connection/driver failures", async () => {
  await writeFile(join(dir, "mapping.json"), '{"private-account-secret":');
  expect(await runMigrationCli(args("preflight"), config())).toBe(1);
  await writeFile(join(dir, "mapping.json"), JSON.stringify(input.mapping));
  catalog.mockRejectedValue(new Error("postgresql://private-password@remote/private-db Synthetic Amber 12345.67"));
  expect(await runMigrationCli(args("preflight"), config())).toBe(1);
  const output = log.mock.calls.flat().join("\n");
  for (const privateText of ["private-account-secret", "private-password", "private-db", "Synthetic Amber", "12345.67", dir]) expect(output).not.toContain(privateText);
});
it("rejects existing, missing-parent and public checkout outputs before connecting", async () => {
  await writeFile(join(dir, "existing.json"), "keep");
  for (const path of [join(dir, "existing.json"), join(dir, "missing", "report.json"), resolve("public-cli-report.json")]) {
    const c = config(); expect(await runMigrationCli(args("apply", path), c)).toBe(1); expect(c.connect).not.toHaveBeenCalled();
  }
  expect(await readFile(join(dir, "existing.json"), "utf8")).toBe("keep");
});
it("permits the ignored private directory, while resolving symlinked parents", async () => {
  const checkout = join(dir, "checkout"); await mkdir(checkout); await mkdir(join(checkout, "private-migration"));
  const report = await reservePrivateReport(join(checkout, "private-migration", "report.json"), checkout); await report.save({ synthetic: true });
  await symlink(checkout, join(dir, "alias"), process.platform === "win32" ? "junction" : "dir");
  await expect(reservePrivateReport(join(dir, "alias", "public.json"), checkout)).rejects.toThrow("private_output_required");
});
it("validates local target mapping, manifest and annotations without echoing values", () => {
  expect(() => readImportMapping({ ...input.mapping, classifcations: {} })).toThrow("invalid_target_mapping");
  expect(() => readImportMapping({ ...input.mapping, owners: [] })).toThrow("invalid_target_mapping");
  expect(() => readManifest({ datasetId: "synthetic", householdId: id, ids: {}, counts: {} })).toThrow("invalid_manifest");
  expect(() => readRules([{ sourceDefinitionTag: "synthetic", measure: "typo", code: "synthetic" }])).toThrow("invalid_annotations");
});


it("adapter errors are reported before connecting or applying", async () => {
  const a = args("apply"); a[a.indexOf("--workbook") + 1] = join(dir, "absent.xlsx");
  const c = config(); expect(await runMigrationCli(a, c)).toBe(1); expect(c.connect).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(join(dir, "report.json"), "utf8"))).toEqual({ findings: [{ severity: "error", code: "workbook_unreadable" }] });
});
it("retains private output and warns against retry when apply outcome is uncertain", async () => {
  expect(await runMigrationCli(args("apply"), config())).toBe(1);
  expect(transaction).toHaveBeenCalledOnce();
  expect(await readFile(join(dir, "report.json"), "utf8")).toBe("");
  const output = log.mock.calls.flat().join("\n");
  expect(output).toContain("apply_outcome_unknown");
  expect(output).toContain("Do not apply again");
  expect(output).not.toContain("no records were imported");
  expect(output).not.toContain("unexpected_write");
  expect(close).toHaveBeenCalledOnce();
});

it("rejects duplicate manifest investment IDs before analytics and reports missing targets explicitly", async () => {
  const parsed = await parseWorkbook(resolve("src/migration/testing/synthetic.xlsx"), await readWorkbookMapping(resolve("src/migration/testing/synthetic-mapping.json")));
  const ids = Object.fromEntries(parsed.dataset!.records.map((r, i) => [r.sourceKey, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]));
  for (const record of parsed.dataset!.records.filter(r => r.kind === "investment")) ids[record.sourceKey] = migrationInvestmentId(id, parsed.dataset!.datasetId, record.sourceKey);
  const manifest = { datasetId: parsed.dataset!.datasetId, householdId: id, ids, counts: Object.fromEntries(countKeys.map(k => [k, 0])) };
  const path = join(dir, "manifest.json");
  const invocation = [...args("reconcile"), "--manifest", path];
  await writeFile(path, JSON.stringify({ ...manifest, ids: { ...ids, "i-b": ids["i-a"] } }));
  const c = config();
  expect(await runMigrationCli(invocation, c)).toBe(1);
  expect(c.connect).not.toHaveBeenCalled();
  await writeFile(path, JSON.stringify({ ...manifest, ids: { ...ids, "i-a": ids["i-b"], "i-b": ids["i-a"] } }));
  expect(await runMigrationCli(invocation, c)).toBe(1);
  expect(c.connect).not.toHaveBeenCalled();
  await writeFile(path, JSON.stringify(manifest));
  catalog.mockResolvedValue({ exists: false, householdId: id, ownerIds: [id], classificationIds: {}, classifications: [], investments: [] });
  expect(await runMigrationCli(invocation, config())).toBe(1);
  expect(log.mock.calls.flat().join("\n")).toContain('"code":"target_missing"');
  expect(log.mock.calls.flat().join("\n")).toContain("migration_preflight_failed");
  expect(transaction).not.toHaveBeenCalled();
});
it("uses importer own-property semantics for opaque inherited investment keys", async () => {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(resolve("src/migration/testing/synthetic.xlsx"));
  workbook.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === "string") cell.value = cell.value.replaceAll("i-a", "constructor");
  })));
  const workbookPath = join(dir, "inherited-key.xlsx"); await workbook.xlsx.writeFile(workbookPath);
  const parsed = await parseWorkbook(workbookPath, await readWorkbookMapping(resolve("src/migration/testing/synthetic-mapping.json")));
  expect(parsed.findings).toEqual([]);
  const ids = Object.fromEntries(parsed.dataset!.records.map((r, i) => [r.sourceKey, r.kind === "investment" ? migrationInvestmentId(id, parsed.dataset!.datasetId, r.sourceKey) : `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]));
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ datasetId: parsed.dataset!.datasetId, householdId: id, ids, counts: Object.fromEntries(countKeys.map(k => [k, 0])) }));
  await writeFile(join(dir, "mapping.json"), JSON.stringify({ ...input.mapping, investments: {} }));
  // Reaching target validation proves valid manifest identity was not rejected before connection.
  catalog.mockResolvedValue({ exists: false, householdId: id, ownerIds: [id], classificationIds: {}, classifications: [], investments: [] });
  const invocation = [...args("reconcile"), "--manifest", join(dir, "manifest.json")];
  invocation[invocation.indexOf("--workbook") + 1] = workbookPath;
  const c = config(); expect(await runMigrationCli(invocation, c)).toBe(1);
  expect(c.connect).toHaveBeenCalledOnce();
  expect(log.mock.calls.flat().join("\n")).toContain('"code":"target_missing"');
  expect(transaction).not.toHaveBeenCalled();
});