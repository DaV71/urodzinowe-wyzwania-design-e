import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { ADMIN_COOKIE, DAY_MS, isValidSessionPayload, verifyValueWeb } from "@/lib/auth/session-web";

const ADMIN_MAX_AGE_MS = 30 * DAY_MS;

function isAdminArea(pathname: string): boolean {
  const path = pathname.replace(/\/{2,}/g, "/").toLowerCase();
  if (path === "/admin/login") return false;
  return path === "/admin" || path.startsWith("/admin/");
}

async function hasAdminSession(request: NextRequest): Promise<boolean> {
  const value = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  return isValidSessionPayload(await verifyValueWeb(value, getEnv().AUTH_SECRET), "admin", ADMIN_MAX_AGE_MS);
}

export async function proxy(request: NextRequest) {
  const response =
    isAdminArea(request.nextUrl.pathname) && !(await hasAdminSession(request))
      ? NextResponse.redirect(new URL("/admin/login", request.url))
      : NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next|api/health).*)"],
};
