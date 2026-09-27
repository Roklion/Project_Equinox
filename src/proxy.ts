import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, SESSION_COOKIE, sessionCookieOptions } from "@/auth/session";
import { isSessionActive } from "@/auth/store";

const publicAssets = new Set([
  "/favicon.ico", "/icon.ico", "/icon.png", "/icon.svg",
  "/apple-icon.png", "/manifest.webmanifest", "/robots.txt",
]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/auth/login" || publicAssets.has(path)) {
    return NextResponse.next();
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let valid = false;
  let inactive = false;
  if (hasValidSession(token, process.env.SESSION_SECRET)) {
    try {
      valid = await isSessionActive(token!);
      inactive = !valid;
    } catch {
      // Database errors fail closed; preserve the cookie so a transient outage does not erase it.
    }
  }
  if (valid) return NextResponse.next();

  const response = path.startsWith("/api/")
    ? new NextResponse(null, { status: 401 })
    : NextResponse.redirect(new URL("/login", request.url));
  if (token && (!hasValidSession(token, process.env.SESSION_SECRET) || inactive)) {
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
