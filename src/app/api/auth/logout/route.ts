import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/auth/session";
import { revokeSession } from "@/auth/store";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await revokeSession(token);
    } catch {
      // Keep the token so the browser can retry server-side revocation.
      // Avoid logging driver errors, which may contain database connection details.
      console.error("Session revocation failed during logout.");
      return new NextResponse("Sign-out could not be confirmed. Please try again.", { status: 503 });
    }
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
