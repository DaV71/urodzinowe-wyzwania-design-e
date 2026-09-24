// Czyste formatowanie dla panelu admina (bez dostępu do bazy).
import type { Source, TaskStatus } from "@/generated/prisma/client";
import { formatDuration } from "@/lib/text";

const TZ = "Europe/Warsaw";

// "ref. z zad. 6: 12:40 → teraz 11:50, −50 s ✓"; ✓ gdy poprawa ≥ minImprovementS.
export function formatReference(
  ref: { taskId: number; resultSeconds: number },
  nowSeconds: number | null | undefined,
  minImprovementS: number | null | undefined,
): { text: string; ok: boolean } {
  const head = `ref. z zad. ${ref.taskId}: ${formatDuration(ref.resultSeconds)} → teraz`;
  if (nowSeconds == null) return { text: `${head} brak czasu ✗`, ok: false };
  const delta = nowSeconds - ref.resultSeconds;
  const ok = delta <= -(minImprovementS ?? 0);
  const sign = delta < 0 ? "−" : delta > 0 ? "+" : "";
  return {
    text: `${head} ${formatDuration(nowSeconds)}, ${sign}${Math.abs(delta)} s ${ok ? "✓" : "✗"}`,
    ok,
  };
}

// "24 września, 14:05" w czasie polskim niezależnie od strefy serwera.
export function formatWarsaw(date: Date): string {
  const day = date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: TZ });
  const time = date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${day}, ${time}`;
}

// Komunikaty po akcjach panelu (?msg=…&task=…); `error` = ramka błędu.
const MESSAGES = new Map<string, { text: (n: string) => string; error: boolean }>([
  ["approved", { text: (n) => `Zatwierdzone — koperta ${n} zaliczona, świeczka się pali.`, error: false }],
  ["rejected", { text: (n) => `Odrzucone — powód widać w kopercie ${n}.`, error: false }],
  ["undone", { text: (n) => `Cofnięte — koperta ${n} znowu otwarta.`, error: false }],
  ["nothing_to_undo", { text: () => "Nic jeszcze nie zaliczono — nie ma czego cofać.", error: true }],
  ["reset", { text: () => "Postęp wyzerowany. Otwarta jest tylko koperta 1.", error: false }],
  ["stale", { text: () => "Stan zadania zmienił się — odśwież stronę i sprawdź jeszcze raz.", error: true }],
  ["no_reason", { text: () => "Podaj powód odrzucenia.", error: true }],
  ["bad_task", { text: () => "Nieznane zadanie.", error: true }],
  ["reset_word", { text: () => "Reset nie wykonany — trzeba wpisać słowo RESET.", error: true }],
]);

// Tylko klucze z białej listy (Map: bez kluczy prototypu typu "constructor").
export function resolveMessage(key: string | undefined, task: string): { text: string; error: boolean } | undefined {
  const m = key === undefined ? undefined : MESSAGES.get(key);
  return m ? { text: m.text(task), error: m.error } : undefined;
}

const STATUS: Record<TaskStatus, string> = {
  LOCKED: "zamknięte",
  ACTIVE: "otwarte",
  PENDING_REVIEW: "do zatwierdzenia",
  DONE: "zaliczone",
};

export const statusLabel = (status: TaskStatus): string => STATUS[status];

const SOURCE: Record<Source, string> = { MANUAL: "zgłoszenie", CODE: "kod", ADMIN: "admin" };

export const sourceLabel = (source: Source | null | undefined): string => (source ? SOURCE[source] : "—");
