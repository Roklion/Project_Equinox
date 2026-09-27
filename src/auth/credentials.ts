import { scrypt, timingSafeEqual } from "node:crypto";

const DUMMY_HASH = "scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
const PASSWORD_HASH_PATTERN = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/;

export function isValidPasswordHash(storedHash: string | undefined): storedHash is string {
  return typeof storedHash === "string" && PASSWORD_HASH_PATTERN.test(storedHash);
}

export async function verifyPassword(password: string, storedHash: string | undefined): Promise<boolean> {
  const match = PASSWORD_HASH_PATTERN.exec(storedHash ?? DUMMY_HASH);
  if (!match) return false;
  const salt = Buffer.from(match[1], "hex");
  const expected = Buffer.from(match[2], "hex");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  return timingSafeEqual(actual, expected) && Boolean(storedHash);
}
