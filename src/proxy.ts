import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, SESSION_COOKIE } from "@/auth/session";
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
  if (hasValidSession(token, process.env.SESSION_SECRET)) {
    try {
      if (await isSessionActive(token!)) return NextResponse.next();
    } catch {
      // Database errors fail closed rather than granting access.
    }
  }
  if (path.startsWith("/api/")) {
    return new NextResponse(null, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
