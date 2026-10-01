import { execFileSync } from "node:child_process";

export default function setup() {
  execFileSync(process.execPath, ["--import", "tsx", "scripts/presentation-fixture.ts"], { stdio: "inherit" });
}
