import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "equinox_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

function key(secret: string | undefined): Buffer | null {
  if (!secret || !/^[a-f0-9]{64,}$/i.test(secret) || secret.length % 2 !== 0) return null;
  return Buffer.from(secret, "hex");
}

export function createSession(secret: string, now = Date.now()): string {
  const signingKey = key(secret);
  if (!signingKey) throw new Error("Session configuration is unavailable.");
  const payload = `v1.${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  const signature = createHmac("sha256", signingKey).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function hasValidSession(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  const signingKey = key(secret);
  if (!signingKey || !token) return false;
  const match = /^v1\.([0-9]+)\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(now / 1000)) return false;
  const payload = token.slice(0, token.lastIndexOf("."));
  const signature = createHmac("sha256", signingKey).update(payload).digest();
  return timingSafeEqual(signature, Buffer.from(match[3], "hex"));
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};
