import { NextResponse, type NextRequest } from "next/server";
import { DAY_MS, isValidSessionPayload, verifyValueWeb } from "@/lib/auth/session-web";

// Stałe zduplikowane celowo: admin.ts importuje next/headers i env (zod) — proxy trzymamy lekkie.
const ADMIN_COOKIE = "bd_admin";
const ADMIN_MAX_AGE_MS = 30 * DAY_MS;

function isAdminArea(pathname: string): boolean {
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

async function hasAdminSession(request: NextRequest): Promise<boolean> {
  const value = request.cookies.get(ADMIN_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!value || !secret) return false;
  return isValidSessionPayload(await verifyValueWeb(value, secret), "admin", ADMIN_MAX_AGE_MS);
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
