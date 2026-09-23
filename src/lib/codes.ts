import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { TASK_COUNT } from "./tasks";

// Alfabet base32 bez 0/O/1/I — łatwy do przepisania z kartki.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function rawCode(secret: string, taskId: number): string {
  const digest = createHmac("sha256", secret).update(`task:${taskId}`).digest();
  // Pierwsze 40 bitów skrótu → 8 znaków po 5 bitów.
  // (2^40 mieści się dokładnie w number; bez BigInt, bo target TS to ES2017).
  const bits = digest.readUIntBE(0, 5);
  let out = "";
  for (let i = 7; i >= 0; i--) out += ALPHABET[Math.floor(bits / 2 ** (i * 5)) % 32];
  return out;
}

// Kod zadania w formacie XXXX-XXXX.
export function codeForTask(secret: string, taskId: number): string {
  const raw = rawCode(secret, taskId);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

// Porównanie w stałym czasie; toleruje małe litery, spacje i myślniki.
export function verifyCode(secret: string, taskId: number, input: string): boolean {
  const normalized = input.toUpperCase().replace(/[\s-]/g, "");
  return timingSafeEqual(sha256(normalized), sha256(rawCode(secret, taskId)));
}

// Lista kodów wszystkich zadań (widok do druku w panelu admina).
export function allCodes(secret: string): { taskId: number; code: string }[] {
  return Array.from({ length: TASK_COUNT }, (_, i) => ({ taskId: i + 1, code: codeForTask(secret, i + 1) }));
}
