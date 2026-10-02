import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createExportService } from "@/application/export";
import { validateExportBundle, type ExportBundle } from "@/domain/portability/bundle";
import { parseCents } from "@/domain/financial";
import { createDatabase } from "./database";
import { seedDemoPortfolio } from "./demo-seed";
import { readDatabaseUrl } from "./environment";
import { createPostgresExportRepository } from "./export";
import { migrateDatabase } from "./migrate";
import { authLoginAttempts, authSessions, households, owners, valuationMarks } from "./schema";

vi.mock("server-only", () => ({}));
const databaseName = `equinox_test_${randomUUID().replaceAll("-", "")}`;
let admin: Client | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
let created = false;
let connectionString: string;

beforeAll(async () => {
  const maintenanceUrl = readDatabaseUrl("TEST_DATABASE_URL");
  admin = new Client({ connectionString: maintenanceUrl, connectionTimeoutMillis: 5_000 });
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  const testUrl = new URL(maintenanceUrl); testUrl.pathname = `/${databaseName}`;
  connectionString = testUrl.toString();
  connection = createDatabase(connectionString); await migrateDatabase(connection.db);
  await seedDemoPortfolio(connection.db);
});

it("runs the private CLI, validates offline, and refuses overwrite/checkout destinations", async () => {
  const [home] = await connection!.db.select().from(households).where(eq(households.name, "Example Household"));
  const directory = await mkdtemp(join(tmpdir(), "equinox-synthetic-export-"));
  const destination = join(directory, "synthetic.json");
  const run = (args: string[], databaseUrl = connectionString) => promisify(execFile)(process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/export-data.ts", ...args],
    { env: { ...process.env, DATABASE_URL: databaseUrl } });
  try {
    const result = await run(["export", home.id, destination]);
    expect(result.stdout).toContain("5 investments, 8 actions, 10 valuations");
    expect(result.stdout).not.toContain("Example Household"); expect(result.stdout).not.toContain("9999999999999999.99");
    const contents = await readFile(destination, "utf8");
    expect(validateExportBundle(JSON.parse(contents))).toEqual([]);
    expect((await run(["validate", destination], "not-a-database-url")).stdout).toContain("Canonical export is valid");
    await expect(run(["export", home.id, destination])).rejects.toThrow();
    expect(await readFile(destination, "utf8")).toBe(contents);
    await expect(run(["export", home.id, "synthetic-must-not-be-written.json"])).rejects.toThrow();
    await expect(readFile("synthetic-must-not-be-written.json")).rejects.toThrow();
    // A private-looking parent can be a directory link into the public checkout.
    const linkedParent = join(directory, "checkout-link");
    await symlink(process.cwd(), linkedParent, process.platform === "win32" ? "junction" : "dir");
    const linkedDestination = join(linkedParent, "synthetic-link-must-not-be-written.json");
    await expect(run(["export", home.id, linkedDestination])).rejects.toThrow();
    await expect(readFile("synthetic-link-must-not-be-written.json")).rejects.toThrow();
    await rm(linkedParent);
    const absent = join(directory, "absent-household.json");
    await expect(run(["export", randomUUID(), absent])).rejects.toThrow();
    await expect(readFile(absent)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
afterAll(async () => {
  try { await connection?.pool.end(); if (created) await admin?.query(`DROP DATABASE "${databaseName}"`); }
  finally { await admin?.end(); }
});

it("exports only the chosen canonical household, including unused lookups and full closed history", async () => {
  const { db } = connection!;
  const [home] = await db.select().from(households);
  const [other] = await db.insert(households).values({ name: "Other synthetic household" }).returning();
  await db.insert(owners).values([{ householdId: other.id, name: "Excluded synthetic owner" }, { householdId: home.id, name: "Unused synthetic owner" }]);
  await db.insert(authSessions).values({ tokenHash: "a".repeat(64), expiresAt: new Date("2027-01-01T00:00:00Z") });
  await db.insert(authLoginAttempts).values({ bucket: "b".repeat(64), failures: 1, windowStartedAt: new Date("2026-01-01T00:00:00Z") });
  const service = createExportService(createPostgresExportRepository(db));
  const timestamp = "2026-01-01T00:00:00.000Z";
  const first = await service.exportHousehold(home.id, timestamp);
  expect(await service.exportHousehold(home.id, timestamp)).toBe(first);
  const bundle = JSON.parse(first) as ExportBundle;
  expect(validateExportBundle(bundle)).toEqual([]);
  expect(bundle.data.household).toEqual(home);
  expect(bundle.data.owners).toHaveLength(3);
  expect(bundle.data.classifications).toHaveLength(15);
  expect(bundle.data.investments).toHaveLength(5);
  expect(bundle.data.actions).toHaveLength(8);
  expect(bundle.data.marks).toHaveLength(10);
  expect(first).not.toContain(other.id); expect(first).not.toContain("Excluded synthetic owner");
  expect(first).not.toContain("tokenHash"); expect(first).not.toContain("failures");
  expect(first).not.toContain("a".repeat(64)); expect(first).not.toContain("b".repeat(64));
  expect(Object.keys(bundle.data)).toEqual(["household", "owners", "classifications", "investments", "actions", "marks"]);
  const transfer = bundle.data.actions.find((a) => a.kind === "transfer")!;
  expect(transfer.movements).toHaveLength(2);
  expect(transfer.movements.map((m) => m.amount)).toEqual(["750.00", "750.00"]);
  const property = bundle.data.investments.find((i) => i.name === "Sample Property Investment")!;
  expect(property.ownerIds).toHaveLength(2); expect(property.groupIds).toHaveLength(1);
  expect(bundle.data.marks.filter((m) => m.investmentId === property.id).some((m) => parseCents(m.grossValue, true) - parseCents(m.debt, true) < 0n)).toBe(true);
  const closed = bundle.data.investments.find((i) => i.status === "closed")!;
  expect(closed.closedOn).toBe("2025-06-30");
  expect(bundle.data.marks.filter((m) => m.investmentId === closed.id)).toHaveLength(2);
  expect(bundle.data.actions.filter((a) => a.movements.some((m) => m.investmentId === closed.id))).toHaveLength(2);
  await expect(service.exportHousehold(randomUUID(), timestamp)).rejects.toThrow("does not exist");
  const otherBundle = JSON.parse(await service.exportHousehold(other.id, timestamp)) as ExportBundle;
  expect(otherBundle.data.investments).toEqual([]); expect(otherBundle.data.owners).toHaveLength(1);
  // Fresh reads reflect canonical corrections rather than cached analytics/export values.
  const mark = bundle.data.marks.find((m) => m.investmentId === property.id)!;
  await db.update(valuationMarks).set({ grossValue: "9999999999999999.99" }).where(eq(valuationMarks.id, mark.id));
  const corrected = JSON.parse(await service.exportHousehold(home.id, timestamp)) as ExportBundle;
  expect(corrected.data.marks.find((m) => m.id === mark.id)?.grossValue).toBe("9999999999999999.99");
});
