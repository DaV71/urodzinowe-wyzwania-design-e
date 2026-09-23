// Weryfikacja podpisu cookie przez Web Crypto (bez node:crypto) — używana w src/proxy.ts.
// Format zgodny z ./session.ts: `payload.sig`, sig = HMAC-SHA256 base64url bez paddingu.

export const PLAYER_COOKIE = "bd_player";
export const ADMIN_COOKIE = "bd_admin";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyValueWeb(token: string, secret: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
  return constantTimeEqual(sig, expected) ? payload : null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

// Payload sesji: `<role>:<issuedAtMs>`; ważny, gdy rola się zgadza i wiek ∈ [0, maxAgeMs] (z 5 min tolerancji zegara).
export function isValidSessionPayload(
  payload: string | null,
  role: "player" | "admin",
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  if (!payload) return false;
  const [r, issued, ...rest] = payload.split(":");
  if (r !== role || rest.length > 0 || !/^\d+$/.test(issued ?? "")) return false;
  const age = now - Number(issued);
  return age >= -5 * 60 * 1000 && age <= maxAgeMs;
}
