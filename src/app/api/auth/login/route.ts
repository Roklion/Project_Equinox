import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/auth/credentials";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/auth/session";
import { clearLoginFailures, loginBucket, reserveLoginAttempt } from "@/auth/rate-limit";
import { saveSession } from "@/auth/store";

export async function POST(request: NextRequest) {
  const genericFailure = () => NextResponse.json({ error: "Unable to sign in." }, { status: 401 });
  const secret = process.env.SESSION_SECRET;
  const hash = process.env.APP_PASSWORD_HASH;
  if (!secret || !hash) return genericFailure();

  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const bucket = loginBucket(ip, secret);
  try {
    if (!await reserveLoginAttempt(bucket)) return genericFailure();
    const body: unknown = await request.json();
    const password = typeof body === "object" && body !== null && "password" in body
      ? (body as { password: unknown }).password : undefined;
    if (typeof password !== "string" || password.length > 1024 || !await verifyPassword(password, hash)) {
      return genericFailure();
    }
    await clearLoginFailures(bucket);
    const token = createSession(secret);
    await saveSession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch {
    return genericFailure();
  }
}
