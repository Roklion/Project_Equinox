import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/auth/session";
import { revokeSession } from "@/auth/store";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let response: NextResponse;
  if (token) {
    try {
      await revokeSession(token);
      response = NextResponse.redirect(new URL("/login", request.url), 303);
    } catch {
      // Remove this browser's cookie, but report that server-side revocation failed.
      response = new NextResponse("Sign-out could not be confirmed. Please try again.", { status: 503 });
    }
  } else {
    response = NextResponse.redirect(new URL("/login", request.url), 303);
  }
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
