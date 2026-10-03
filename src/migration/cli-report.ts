import { open, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

function inside(root: string, path: string) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../");
}
/** Resolve symlinks before permitting the ignored convenience directory. */
export async function reservePrivateReport(requested: string, cwd: string) {
  if (!isAbsolute(requested)) throw new Error("absolute_output_required");
  const root = await realpath(cwd);
  const destination = join(await realpath(dirname(resolve(requested))), basename(requested));
  const privateRoot = join(root, "private-migration");
  if (inside(root, destination) && !inside(privateRoot, destination)) throw new Error("private_output_required");
  const file = await open(destination, "wx", 0o600);
  let closed = false;
  const close = async () => { if (!closed) { await file.close(); closed = true; } };
  return {
    close,
    async save(value: unknown) {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await file.sync();
      await file.close(); closed = true;
    },
    async discard() {
      await close();
      await unlink(destination);
    },
  };
}
