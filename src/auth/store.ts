import "server-only";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { readDatabaseUrl } from "@/persistence/environment";

let pool: Pool | undefined;

export function authDatabase(): Pool {
  pool ??= new Pool({ connectionString: readDatabaseUrl(), max: 3 });
  return pool;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function saveSession(token: string): Promise<void> {
  const expiresAt = new Date(Number(token.split(".")[1]) * 1000);
  await authDatabase().query(
    "INSERT INTO auth_sessions (token_hash, expires_at) VALUES ($1, $2)",
    [tokenHash(token), expiresAt],
  );
}

export async function isSessionActive(token: string): Promise<boolean> {
  const result = await authDatabase().query(
    "SELECT 1 FROM auth_sessions WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash(token)],
  );
  return result.rowCount === 1;
}

export async function revokeSession(token: string): Promise<void> {
  await authDatabase().query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash(token)]);
}
