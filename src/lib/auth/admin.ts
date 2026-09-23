import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { signValue, verifyValue } from "./session";
import { DAY_MS, isValidSessionPayload } from "./session-web";

export const ADMIN_COOKIE = "bd_admin";
export const ADMIN_MAX_AGE_DAYS = 30;

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const payload = verifyValue(value, getEnv().AUTH_SECRET);
  return isValidSessionPayload(payload, "admin", ADMIN_MAX_AGE_DAYS * DAY_MS);
}

// Dla Server Components / actions panelu: bez sesji → /admin/login.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

// Tylko w Server Action / Route Handler.
export async function setAdminCookie(): Promise<void> {
  const env = getEnv();
  (await cookies()).set(ADMIN_COOKIE, signValue(`admin:${Date.now()}`, env.AUTH_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE_DAYS * 24 * 60 * 60,
  });
}

export async function clearAdminCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
