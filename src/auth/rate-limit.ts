import "server-only";
import { createHmac } from "node:crypto";
import { authDatabase } from "@/auth/store";

const MAX_ATTEMPTS = 5;

export function loginBucket(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

// Reserve before password verification so parallel requests cannot all pass a stale count.
export async function reserveLoginAttempt(bucket: string): Promise<boolean> {
  const result = await authDatabase().query<{ failures: number }>(
    `INSERT INTO auth_login_attempts (bucket, failures, window_started_at)
     VALUES ($1, 1, now())
     ON CONFLICT (bucket) DO UPDATE SET
       failures = CASE WHEN auth_login_attempts.window_started_at > now() - interval '15 minutes'
         THEN auth_login_attempts.failures + 1 ELSE 1 END,
       window_started_at = CASE WHEN auth_login_attempts.window_started_at > now() - interval '15 minutes'
         THEN auth_login_attempts.window_started_at ELSE now() END
     RETURNING failures`,
    [bucket],
  );
  return result.rows[0].failures <= MAX_ATTEMPTS;
}

export async function clearLoginFailures(bucket: string): Promise<void> {
  await authDatabase().query("DELETE FROM auth_login_attempts WHERE bucket = $1", [bucket]);
}
