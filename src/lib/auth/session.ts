import { createHmac, timingSafeEqual } from "node:crypto";

// Podpisane wartości cookie: `payload.sig`, sig = HMAC-SHA256(secret, payload) w base64url bez paddingu.
// Odpowiednik dla proxy (Web Crypto): ./session-web.ts — format musi pozostać identyczny.

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signValue(payload: string, secret: string): string {
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyValue(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  return safeEqual(sig, sign(payload, secret)) ? payload : null;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
