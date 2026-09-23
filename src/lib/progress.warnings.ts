import type { Task } from "@/generated/prisma/client";

// Wejście zgłoszenia (ścieżki i hashe SHA-256 zapisanych zdjęć, opcjonalne wyniki).
export type SubmitInput = {
  note?: string;
  photos: { path: string; hash: string }[];
  distanceM?: number;
  durationS?: number;
};

export type WarningContext = {
  unlockedAt: Date;
  now: Date;
  reference?: number | null; // czas referencyjny (s) z zadania compareToTask
  knownHashes: Set<string>; // hashe zdjęć z innych zgłoszeń
};

const MIN_SUBMIT_DELAY_MS = 5 * 60_000;

// Minimalny format mm:ss (minuty bez limitu 59). TODO(T5): można podmienić na lib/text.
function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Kilometry z przecinkiem, do 2 miejsc, bez zbędnych zer: 2950 → "2,95", 3000 → "3".
function km(meters: number): string {
  return String(Number((meters / 1000).toFixed(2))).replace(".", ",");
}

// Miękkie ostrzeżenia dla Dawida — nie blokują zgłoszenia. Czysta funkcja.
export function computeWarnings(task: Task, input: SubmitInput, ctx: WarningContext): string[] {
  const warnings: string[] = [];

  if (task.minDistanceM != null && input.distanceM != null && input.distanceM < task.minDistanceM) {
    warnings.push(`Dystans ${km(input.distanceM)} km poniżej progu ${km(task.minDistanceM)} km`);
  }

  if (task.maxDurationS != null && input.durationS != null && input.durationS > task.maxDurationS) {
    warnings.push(`Czas ${mmss(input.durationS)} powyżej limitu ${mmss(task.maxDurationS)}`);
  }

  const sinceUnlock = ctx.now.getTime() - ctx.unlockedAt.getTime();
  if (sinceUnlock < MIN_SUBMIT_DELAY_MS) {
    warnings.push(`Zgłoszone ${Math.max(0, Math.floor(sinceUnlock / 60_000))} min po odblokowaniu`);
  }

  if (input.photos.some((p) => ctx.knownHashes.has(p.hash))) {
    warnings.push("Zdjęcie użyte już w innym zgłoszeniu");
  }

  if (
    task.compareToTask != null &&
    task.minImprovementS != null &&
    ctx.reference != null &&
    input.durationS != null &&
    input.durationS > ctx.reference - task.minImprovementS
  ) {
    warnings.push(
      `Czas ${mmss(input.durationS)} nie jest szybszy o ${task.minImprovementS} s od referencji ${mmss(ctx.reference)}`,
    );
  }

  return warnings;
}
