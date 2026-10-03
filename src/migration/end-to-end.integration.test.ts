import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { runMigrationCli } from "./cli";
import { legacyWorkbookMapping, writeLegacyWorkbook } from "./testing/legacy-workbook";
import { createAnalyticsService } from "@/application/analytics";
import { createExportService } from "@/application/export";
import type { ImportManifest } from "@/application/migration-ports";
import type { ReconciliationRecord } from "@/application/reconciliation";
import { validateExportBundle, type ExportBundle } from "@/domain/portability/bundle";
import { createPostgresAnalyticsRepository } from "@/persistence/analytics";
import { createDatabase } from "@/persistence/database";
import { readDatabaseUrl } from "@/persistence/environment";
import { createPostgresExportRepository } from "@/persistence/export";
import { migrateDatabase } from "@/persistence/migrate";
import { authLoginAttempts, authSessions, households, owners, valuationMarks } from "@/persistence/schema";

vi.mock("server-only", () => ({}));
const databaseName = `equinox_test_${randomUUID().replaceAll("-", "")}`;
let admin: Client | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
let created = false;
let directory: string;
let url: string;
let householdId: string;
let ownerIds: string[];

beforeAll(async () => {
  const maintenance = readDatabaseUrl("TEST_DATABASE_URL");
  const target = new URL(maintenance);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Local disposable database required.");
  admin = new Client({ connectionString: maintenance, connectionTimeoutMillis: 5_000 });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  target.pathname = `/${databaseName}`; url = target.toString();
  connection = createDatabase(url);
  await migrateDatabase(connection.db);
  const [home] = await connection.db.insert(households).values({ name: "Synthetic legacy household" }).returning();
  householdId = home.id;
  const configuredOwners = await connection.db.insert(owners).values([
    { householdId, name: "Synthetic owner A" }, { householdId, name: "Synthetic owner B" },
  ]).returning();
  ownerIds = configuredOwners.map(o => o.id);
  // Operational state exists so its absence from exports is not a vacuous assertion.
  await connection.db.insert(authSessions).values({ tokenHash: "c".repeat(64), expiresAt: new Date("2027-01-01T00:00:00Z") });
  await connection.db.insert(authLoginAttempts).values({ bucket: "d".repeat(64), failures: 1, windowStartedAt: new Date("2026-01-01T00:00:00Z") });
  directory = await mkdtemp(join(tmpdir(), "equinox-synthetic-epic5-"));
  await writeLegacyWorkbook(join(directory, "synthetic.xlsx"));
  await writeFile(join(directory, "adapter.json"), JSON.stringify(legacyWorkbookMapping()));
  await writeFile(join(directory, "target.json"), JSON.stringify({
    householdId, owners: { "owner-a": ownerIds[0], "owner-b": ownerIds[1] }, classifications: {},
    investments: { "i-a": null, "i-b": null, "i-c": null },
  }));
  await writeFile(join(directory, "annotations.json"), JSON.stringify([{
    sourceDefinitionTag: "legacy-value-change", measure: "pnl", code: "ignores-external-flows",
    note: "Synthetic source subtracts beginning gross from ending gross; canonical P&L adjusts external flows and debt.",
  }]));
});

afterAll(async () => {
  try {
    await connection?.pool.end();
    if (created) await admin?.query(`DROP DATABASE "${databaseName}"`);
  } finally {
    await admin?.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it("completes the legacy workbook -> CLI -> canonical analytics -> reconciliation -> validated export path", async () => {
  const exporter = createExportService(createPostgresExportRepository(connection!.db));
  const exportCanonical = () => exporter.exportHousehold(householdId, "2026-01-02T00:00:00.000Z");
  const log = vi.fn();
  const run = (command: string, output = command) => runMigrationCli([
    command, "--workbook", join(directory, "synthetic.xlsx"), "--adapter", join(directory, "adapter.json"),
    "--output", join(directory, `${output}.json`),
    ...(command === "inspect" ? [] : ["--mapping", join(directory, "target.json")]),
    ...(command === "apply" ? ["--backup-confirmed"] : []),
    ...(command === "reconcile" ? ["--manifest", join(directory, "apply.json"), "--annotations", join(directory, "annotations.json")] : []),
  ], { env: { MIGRATION_DATABASE_URL: url }, log });
  const report = async (name: string) => JSON.parse(await readFile(join(directory, `${name}.json`), "utf8"));

  expect(await run("inspect")).toBe(0);
  const inspected = await report("inspect");
  expect(inspected.findings).toEqual([]);
  expect(inspected.dataset.records).toHaveLength(15);
  expect(inspected.dataset.expectations).toHaveLength(15);
  const before = await exportCanonical();
  expect(await run("preflight")).toBe(0);
  expect(await report("preflight")).toMatchObject({
    findings: [], counts: { investments: 3, existingInvestments: 0, classifications: 0,
      contributions: 3, withdrawals: 2, transfers: 1, valuations: 6, closures: 1 },
  });
  expect(await exportCanonical()).toBe(before);
  expect(await run("apply")).toBe(0);
  const manifest = await report("apply") as ImportManifest;
  expect(manifest.householdId).toBe(householdId);
  expect(Object.keys(manifest.ids)).toHaveLength(15);

  const serialized = await exportCanonical();
  const bundle = JSON.parse(serialized) as ExportBundle;
  expect(validateExportBundle(bundle)).toEqual([]);
  expect(bundle.data.household.id).toBe(householdId);
  expect(bundle.data.classifications).toEqual([]);
  expect(bundle.data.investments).toHaveLength(3);
  for (const investment of bundle.data.investments) {
    expect(investment.classifications).toEqual({});
    expect(investment.groupIds).toEqual([]);
  }
  expect(bundle.data.investments.find(i => i.id === manifest.ids["i-a"])?.ownerIds).toEqual([...ownerIds].sort());
  expect(bundle.data.investments.find(i => i.id === manifest.ids["i-b"])?.ownerIds).toEqual([ownerIds[1]]);
  expect(bundle.data.investments.find(i => i.id === manifest.ids["i-c"])).toMatchObject({
    ownerIds: [ownerIds[0]], status: "closed", closedOn: "2026-01-01",
  });
  expect(bundle.data.actions).toHaveLength(6);
  expect(bundle.data.marks).toHaveLength(6);
  const transfer = bundle.data.actions.find(a => a.id === manifest.ids["t-a"])!;
  expect(transfer).toMatchObject({ kind: "transfer", amount: "5.01", effectiveDate: "2025-08-01" });
  expect(transfer.movements).toHaveLength(2);
  expect(transfer.movements).toEqual(expect.arrayContaining([
    expect.objectContaining({ investmentId: manifest.ids["i-a"], role: "source", direction: "out", amount: "5.01" }),
    expect.objectContaining({ investmentId: manifest.ids["i-b"], role: "destination", direction: "in", amount: "5.01" }),
  ]));
  expect(bundle.data.marks.find(m => m.id === manifest.ids["v-b1"])).toMatchObject({
    investmentId: manifest.ids["i-b"], grossValue: "4.00", debt: "9.00", asOfDate: "2026-01-01",
  });
  expect(bundle.data.marks.find(m => m.id === manifest.ids["v-a0"])?.asOfDate).toBe("2025-01-01");
  expect(new Set(bundle.data.marks.map(m => `${m.investmentId}/${m.asOfDate}`)).size).toBe(6);
  await expect(connection!.db.insert(valuationMarks).values({
    householdId, investmentId: manifest.ids["i-a"], asOfDate: "2025-01-01", grossValue: "1.00", debt: "0.00",
  })).rejects.toThrow();
  expect(await exportCanonical()).toBe(serialized);

  const analytics = createAnalyticsService(createPostgresAnalyticsRepository(connection!.db));
  const inception = await analytics.inception(householdId, "2026-01-01");
  expect(inception.cashFlows).toEqual({ contributionsCents: 16000n, distributionsCents: 3200n, netExternalCashFlowCents: 12800n });
  expect(inception.pnl).toEqual({ status: "available", value: -4300n });
  expect(inception.flows.some(f => f.actionId === transfer.id)).toBe(false);
  const transferDay = await analytics.period(householdId, "2025-07-31", "2025-08-01");
  expect(transferDay.cashFlows).toEqual({ contributionsCents: 0n, distributionsCents: 0n, netExternalCashFlowCents: 0n });
  const closedReturns = await analytics.returns(householdId, "2026-01-01", { investmentIds: [manifest.ids["i-c"]] });
  expect(closedReturns.moic).toEqual({ status: "available", value: 1.2 });
  expect(closedReturns.xirr.status).toBe("available");
  if (closedReturns.xirr.status === "available") expect(closedReturns.xirr.value).toBeCloseTo(0.2, 8);
  const series = await analytics.valueSeries(householdId, "2025-01-01", "2026-01-01");
  expect(series.points.map(p => ({ date: p.asOfDate, totals: p.totals }))).toEqual([
    { date: "2025-01-01", totals: { status: "available", value: { grossValueCents: 16000n, debtCents: 0n, navCents: 16000n } } },
    { date: "2026-01-01", totals: { status: "available", value: { grossValueCents: 9400n, debtCents: 900n, navCents: 8500n } } },
  ]);

  expect(await run("reconcile")).toBe(2);
  const comparisons = (await report("reconcile")).results as ReconciliationRecord[];
  expect(comparisons).toHaveLength(15);
  expect(comparisons.filter(r => r.status === "match").map(r => r.sourceKey).sort()).toEqual([
    "e-closed-moic", "e-closed-xirr", "e-debt", "e-gross", "e-history", "e-history-between",
    "e-in", "e-moic", "e-nav", "e-negative", "e-out", "e-pnl",
  ]);
  expect(comparisons.find(r => r.sourceKey === "e-missing")).toMatchObject({ status: "source_unavailable", source: { status: "missing" } });
  expect(comparisons.find(r => r.sourceKey === "e-no-coverage")).toMatchObject({ status: "equinox_unavailable", equinox: { status: "incomplete", reason: "missing_valuation" } });
  expect(comparisons.find(r => r.sourceKey === "e-legacy-pnl")).toMatchObject({
    status: "definition_mismatch", source: { status: "available", value: "-66.00" },
    equinox: { status: "available", value: "-43.00" }, difference: "23.00", explanation: { code: "ignores-external-flows" },
  });
  // Reconciliation is read-only; the canonical portability output is independent of source/operational artifacts.
  expect(await exportCanonical()).toBe(serialized);
  expect(Object.keys(bundle.data)).toEqual(["household", "owners", "classifications", "investments", "actions", "marks"]);
  for (const marker of ["Legacy bucket", "Example Holdings", "sourceKey", "datasetId", "tokenHash", "failures", "c".repeat(64), "d".repeat(64)]) {
    expect(serialized).not.toContain(marker);
  }
  for (const record of [...bundle.data.actions, ...bundle.data.marks]) {
    expect(record.source).toBe("import"); expect(record.sourceReference).toBeUndefined();
  }
  expect(await run("apply", "repeat")).toBe(1);
  expect(await exportCanonical()).toBe(serialized);
  expect(log.mock.calls.flat().join("\n")).not.toContain(url);
}, 30_000);
