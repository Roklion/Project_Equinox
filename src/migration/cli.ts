import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createMigrationService, migrationInvestmentId, MigrationError } from "@/application/migration";
import type { ImportFinding, MigrationRepository } from "@/application/migration-ports";
import { createReconciliationService } from "@/application/reconciliation";
import type { AnalyticsRepository } from "@/application/analytics-ports";
import { validateMigration } from "@/domain/migration/validate";
import { createDatabase } from "@/persistence/database";
import { createPostgresMigrationRepository } from "@/persistence/migration";
import { createPostgresAnalyticsRepository } from "@/persistence/analytics";
import { parseWorkbook } from "./spreadsheet";
import { readImportMapping, readManifest, readRules } from "./cli-config";
import { reservePrivateReport } from "./cli-report";

export type CliConnection = { migration: MigrationRepository; analytics: AnalyticsRepository; close(): Promise<void> };
function connect(url: string): CliConnection {
  const { db, pool } = createDatabase(url);
  return { migration: createPostgresMigrationRepository(db), analytics: createPostgresAnalyticsRepository(db), close: () => pool.end() };
}
const usage = "Use data:migrate -- inspect|preflight|apply|reconcile --workbook <absolute-path> --adapter <absolute-json-path> --output <absolute-private-json-path>. Target commands require --mapping; apply requires --backup-confirmed; reconcile requires --manifest and optionally --annotations. Configure MIGRATION_DATABASE_URL explicitly.";
function argumentsFor(args: string[]) {
  const [command, ...rest] = args;
  if (!["inspect", "preflight", "apply", "reconcile"].includes(command)) throw new Error();
  const allowed = ["workbook", "adapter", "output", ...(command === "inspect" ? [] : ["mapping"]), ...(command === "apply" ? ["backup-confirmed"] : []), ...(command === "reconcile" ? ["manifest", "annotations"] : [])];
  const options: Record<string, string> = Object.create(null);
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith("--") || !allowed.includes(key) || Object.hasOwn(options, key)) throw new Error();
    if (key === "backup-confirmed") options[key] = "yes";
    else { const value = rest[++i]; if (!value || !isAbsolute(value)) throw new Error(); options[key] = value; }
  }
  const required = ["workbook", "adapter", "output", ...(command === "inspect" ? [] : ["mapping"]), ...(command === "apply" ? ["backup-confirmed"] : []), ...(command === "reconcile" ? ["manifest"] : [])];
  if (required.some(k => !options[k])) throw new Error();
  return { command, options };
}
async function json(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")); }
function databaseUrl(env: Record<string, string | undefined>) {
  const value = env.MIGRATION_DATABASE_URL?.trim();
  if (!value) throw new Error();
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) throw new Error();
  return value;
}

/** Local composition only. Logs omit private paths, values, driver details and annotations. */
export async function runMigrationCli(args: string[], config: {
  cwd?: string; env?: Record<string, string | undefined>; log?: (message: string) => void; connect?: (url: string) => CliConnection;
} = {}): Promise<number> {
  const log = config.log ?? console.info;
  let connection: CliConnection | undefined;
  let report: Awaited<ReturnType<typeof reservePrivateReport>> | undefined;
  let committed = false;
  let applyUncertain = false;
  let saved = false;
  try {
    const { command, options } = argumentsFor(args);
    const parsed = await parseWorkbook(options.workbook, await json(options.adapter));
    const findings = (items: Array<{ code: string; sourceKey?: string }>) => {
      for (const f of items) log(JSON.stringify({ code: f.code, ...(f.sourceKey === undefined ? {} : { sourceKey: f.sourceKey }) }));
    };
    report = await reservePrivateReport(options.output, config.cwd ?? process.cwd());
    if (!parsed.dataset) {
      await report.save({ findings: parsed.findings }); saved = true;
      findings(parsed.findings); return 1;
    }
    findings(parsed.findings);
    if (command === "inspect") {
      await report.save(parsed); saved = true;
      log(`Inspection complete: ${parsed.dataset.records.length} records, ${parsed.findings.length} adapter findings.`); return 0;
    }
    const mapping = readImportMapping(await json(options.mapping));
    const input = { dataset: parsed.dataset, mapping };
    const manifest = command === "reconcile" ? readManifest(await json(options.manifest)) : undefined;
    const rules = options.annotations ? readRules(await json(options.annotations)) : [];
    if (manifest && (manifest.householdId !== mapping.householdId || manifest.datasetId !== input.dataset.datasetId
      || Object.keys(manifest.ids).length !== input.dataset.records.length || input.dataset.records.some(r => !Object.hasOwn(manifest.ids, r.sourceKey)))) throw new Error();
    const investmentRecords = input.dataset.records.filter(r => r.kind === "investment");
    const investmentIds = investmentRecords.map(r => manifest?.ids[r.sourceKey]);
    if (manifest && (new Set(investmentIds).size !== investmentIds.length || investmentRecords.some(r =>
      manifest.ids[r.sourceKey] !== (mapping.investments?.[r.sourceKey] ?? migrationInvestmentId(mapping.householdId, input.dataset.datasetId, r.sourceKey))))) throw new Error();
    connection = (config.connect ?? connect)(databaseUrl(config.env ?? process.env));
    if (command === "reconcile") {
      // Existing history is expected here; use domain validation, not import collision policy.
      const catalog = await connection.migration.catalog(mapping.householdId);
      const errors: ImportFinding[] = validateMigration(input.dataset, mapping, catalog);
      if (!catalog.exists) errors.push({ code: "target_missing", severity: "error" });
      if (errors.length) throw new MigrationError("preflight_failed", errors);
      const results = await createReconciliationService(connection.analytics).reconcile(input.dataset, manifest!, rules);
      await report.save({ datasetId: manifest!.datasetId, householdId: manifest!.householdId, results }); saved = true;
      const differences = results.filter(r => r.status !== "match").length;
      log(`Reconciliation complete: ${results.length} comparisons, ${differences} require review.`);
      return differences ? 2 : 0;
    }
    const service = createMigrationService(connection.migration);
    const plan = await service.preflight(input);
    if (command === "preflight" || plan.findings.length) {
      await report.save({ ...plan, adapterFindings: parsed.findings }); saved = true;
      findings(plan.findings); log(`Preflight complete: ${plan.findings.length} blocking findings. No writes applied.`);
      return plan.findings.length ? 1 : 0;
    }
    const applied = await service.apply(input); committed = true;
    await report.save(applied); saved = true;
    log(`Apply committed: ${applied.counts.investments} new investments, ${applied.counts.valuations} valuations. Retain the private manifest and run reconcile.`);
    return 0;
  } catch (error) {
    if (error instanceof MigrationError) {
      applyUncertain = error.code === "write_failed";
      for (const f of error.findings) log(JSON.stringify({ code: f.code, ...(f.sourceKey === undefined ? {} : { sourceKey: f.sourceKey }) }));
    }
    log(applyUncertain ? "apply_outcome_unknown: The transaction response failed; records may have committed. Do not apply again before inspecting the target and recovering the manifest or restoring the backup." : error instanceof MigrationError && error.code === "preflight_failed" ? "migration_preflight_failed: Correct the reported target or mapping findings before retrying." : committed ? "apply_committed_report_failed: Database apply committed but manifest output failed. Do not apply again; recover IDs using the stable dataset/source identities and inspect the target." : `migration_command_failed: Check arguments, private JSON inputs, explicit target configuration and output permissions. ${usage}`);
    return 1;
  } finally {
    // Cleanup failures must never expose a private path or override a sanitized result.
    if (report && !saved && !committed && !applyUncertain) await report.discard().catch(() => log("report_cleanup_failed: Remove the incomplete private report manually."));
    if (report && !saved && (committed || applyUncertain)) await report.close().catch(() => log("report_close_failed"));
    if (connection) await connection.close().catch(() => log("database_close_failed"));
  }
}
