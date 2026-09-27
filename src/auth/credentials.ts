import { scrypt, timingSafeEqual } from "node:crypto";

const DUMMY_HASH = "scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export async function verifyPassword(password: string, storedHash: string | undefined): Promise<boolean> {
  const parts = (storedHash ?? DUMMY_HASH).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [cost, blockSize, parallelization] = parts.slice(1, 4).map(Number);
  const salt = parts[4];
  const expected = Buffer.from(parts[5], "hex");
  if (cost !== 16384 || blockSize !== 8 || parallelization !== 1 || !/^[a-f0-9]{32}$/.test(salt) || expected.length !== 32) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 32, { N: cost, r: blockSize, p: parallelization }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  return timingSafeEqual(actual, expected) && Boolean(storedHash);
}
