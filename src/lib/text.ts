// Pomocnicze formatowanie tekstu po polsku: odmiana liczebników, czas, dystans.

/**
 * Polska odmiana rzeczownika po liczebniku.
 * 1 → one; końcówka 2–4 (poza 12–14) → few; pozostałe → many.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Sekundy → "mm:ss", a od godziny "h:mm:ss". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/** "12:40" → 760, "1:02:03" → 3723; niepoprawny format → null. */
export function parseDuration(input: string): number | null {
  // Separator: dwukropek albo — z klawiatury numerycznej telefonu — kropka, przecinek lub spacja.
  const match = /^(?:(\d+)[:.,\s])?(\d{1,3})[:.,\s](\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, hRaw, mRaw, sRaw] = match;
  const h = hRaw === undefined ? 0 : Number(hRaw);
  const m = Number(mRaw);
  const s = Number(sRaw);
  if (s > 59) return null;
  if (hRaw !== undefined && m > 59) return null;
  return h * 3600 + m * 60 + s;
}

/** Metry → kilometry z dwoma miejscami i przecinkiem: 2100 → "2,10". */
export function formatKm(meters: number): string {
  const hundredths = Math.round(meters / 10);
  const km = Math.floor(hundredths / 100);
  return `${km},${pad2(hundredths % 100)}`;
}
