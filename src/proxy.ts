import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { ADMIN_COOKIE, DAY_MS, isValidSessionPayload, verifyValueWeb } from "@/lib/auth/session-web";

const ADMIN_MAX_AGE_MS = 30 * DAY_MS;

function isAdminArea(pathname: string): boolean {
  const path = pathname.replace(/\/{2,}/g, "/").toLowerCase();
  if (path === "/admin/login") return false;
  return path === "/admin" || path.startsWith("/admin/");
}

// Czysta decyzja o przekierowaniu na logowanie. Server Action (POST z nagłówkiem next-action) przepuszczamy:
// każda akcja admina zaczyna od requireAdmin(), a redirect() z akcji Next obsługuje poprawnie — 307 z proxy
// kończyłby się po stronie klienta błędem "unexpected response".
export function shouldRedirectToLogin(pathname: string, method: string, headers: Headers, hasSession: boolean): boolean {
  if (!isAdminArea(pathname) || hasSession) return false;
  const isServerAction = method.toUpperCase() === "POST" && headers.has("next-action");
  return !isServerAction;
}

async function hasAdminSession(request: NextRequest): Promise<boolean> {
  const value = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  return isValidSessionPayload(await verifyValueWeb(value, getEnv().AUTH_SECRET), "admin", ADMIN_MAX_AGE_MS);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const redirect =
    isAdminArea(pathname) &&
    shouldRedirectToLogin(pathname, request.method, request.headers, await hasAdminSession(request));
  const response = redirect
    ? NextResponse.redirect(new URL("/admin/login", request.url))
    : NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next|api/health).*)"],
};
