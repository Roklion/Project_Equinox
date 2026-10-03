import { execFileSync, spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
it("ignores documented private migration artifacts while keeping synthetic fixtures visible", () => {
  const privatePaths = [
    "private-migration/source.xlsx", "private-migration/adapter.json", "private-migration/target.json",
    "private-migration/inspection.json", "private-migration/preflight.json", "private-migration/manifest.json",
    "private-migration/reconciliation.json", "private-migration/annotations.json", "private-migration/export.json",
    "scratch/source.private.xlsx", "scratch/report.private.json", "backups/synthetic.dump", "synthetic.dump.tmp",
  ];
  expect(git("check-ignore", "--no-index", ...privatePaths).split(/\r?\n/).sort()).toEqual([...privatePaths].sort());
  const visible = spawnSync("git", ["check-ignore", "--no-index", "--non-matching", "--verbose",
    "src/migration/testing/synthetic.xlsx", "src/migration/testing/synthetic-data.json"], { encoding: "utf8" });
  expect(visible.status).toBe(1); // Git returns 1 when no supplied path is ignored.
  expect(visible.stdout.trim().split(/\r?\n/).every(line => line.startsWith("::\t"))).toBe(true);
});

it("does not track documented private artifacts, including files force-added despite ignore rules", () => {
  const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
  expect(tracked.filter(path => /^(private-migration|backups|backup)\//.test(path)
    || /\.private\.(xlsx|json)$|\.dump(?:\.tmp)?$|\.backup$|\.sql\.gz$/.test(path))).toEqual([]);
});
