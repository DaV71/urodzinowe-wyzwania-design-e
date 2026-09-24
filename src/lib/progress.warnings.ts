import type { Task } from "@/generated/prisma/client";
import { formatDuration } from "@/lib/text";

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

// Kilometry z przecinkiem, do 2 miejsc, bez zbędnych zer: 2950 → "2,95", 3000 → "3".
function km(meters: number): string {
  return String(Number((meters / 1000).toFixed(2))).replace(".", ",");
}

// Miękkie ostrzeżenia dla Dawida — nie blokują zgłoszenia. Czysta funkcja.
export function computeWarnings(task: Task, input: SubmitInput, ctx: WarningContext): string[] {
  const warnings: string[] = [];

  if (task.askDistance && input.distanceM == null) warnings.push("Nie podano dystansu");
  if (task.askDuration && input.durationS == null) warnings.push("Nie podano czasu");

  if (task.minDistanceM != null && input.distanceM != null && input.distanceM < task.minDistanceM) {
    warnings.push(`Dystans ${km(input.distanceM)} km poniżej progu ${km(task.minDistanceM)} km`);
  }

  if (task.maxDurationS != null && input.durationS != null && input.durationS > task.maxDurationS) {
    warnings.push(`Czas ${formatDuration(input.durationS)} powyżej limitu ${formatDuration(task.maxDurationS)}`);
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
      `Czas ${formatDuration(input.durationS)} nie jest szybszy o ${task.minImprovementS} s od referencji ${formatDuration(ctx.reference)}`,
    );
  }

  return warnings;
}
