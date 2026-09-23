import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

// Porównanie skrótów SHA-256 (stała długość) — nie ujawnia długości sekretu przez wczesne wyjście.
export function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}
