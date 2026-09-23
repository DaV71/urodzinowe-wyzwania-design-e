import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { signValue, verifyValue } from "./session";
import { DAY_MS, isValidSessionPayload } from "./session-web";

export const PLAYER_COOKIE = "bd_player";
export const PLAYER_MAX_AGE_DAYS = 120;

export async function isPlayer(): Promise<boolean> {
  const value = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!value) return false;
  const payload = verifyValue(value, getEnv().AUTH_SECRET);
  return isValidSessionPayload(payload, "player", PLAYER_MAX_AGE_DAYS * DAY_MS);
}

// Tylko w Server Action / Route Handler.
export async function setPlayerCookie(): Promise<void> {
  const env = getEnv();
  (await cookies()).set(PLAYER_COOKIE, signValue(`player:${Date.now()}`, env.AUTH_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: PLAYER_MAX_AGE_DAYS * 24 * 60 * 60,
  });
}
