import { describe, expect, it } from "vitest";
import { formatReference, formatWarsaw, resolveMessage, sourceLabel, statusLabel } from "./format";

describe("formatReference", () => {
  const ref = { taskId: 6, resultSeconds: 760 };

  it("poprawa o co najmniej minImprovementS → ✓ i znak minus", () => {
    expect(formatReference(ref, 710, 30)).toEqual({
      text: "ref. z zad. 6: 12:40 → teraz 11:50, −50 s ✓",
      ok: true,
    });
  });

  it("dokładnie na granicy poprawy → ✓", () => {
    expect(formatReference(ref, 730, 30).ok).toBe(true);
  });

  it("za mała poprawa → ✗", () => {
    expect(formatReference(ref, 740, 30)).toEqual({
      text: "ref. z zad. 6: 12:40 → teraz 12:20, −20 s ✗",
      ok: false,
    });
  });

  it("wolniej niż referencja → plus", () => {
    expect(formatReference(ref, 775, 30).text).toBe("ref. z zad. 6: 12:40 → teraz 12:55, +15 s ✗");
  });

  it("bez minImprovementS wystarczy nie być wolniej", () => {
    expect(formatReference(ref, 760, null)).toEqual({
      text: "ref. z zad. 6: 12:40 → teraz 12:40, 0 s ✓",
      ok: true,
    });
  });

  it("brak czasu w zgłoszeniu → ✗", () => {
    expect(formatReference(ref, null, 30)).toEqual({
      text: "ref. z zad. 6: 12:40 → teraz brak czasu ✗",
      ok: false,
    });
  });
});

describe("formatWarsaw", () => {
  it("czas polski niezależnie od strefy serwera (lato, UTC+2)", () => {
    expect(formatWarsaw(new Date("2026-09-24T12:05:00Z"))).toBe("24 września, 14:05");
  });

  it("zima, UTC+1", () => {
    expect(formatWarsaw(new Date("2026-12-01T07:03:00Z"))).toBe("1 grudnia, 08:03");
  });
});

describe("etykiety", () => {
  it("statusy", () => {
    expect(statusLabel("LOCKED")).toBe("zamknięte");
    expect(statusLabel("ACTIVE")).toBe("otwarte");
    expect(statusLabel("PENDING_REVIEW")).toBe("do zatwierdzenia");
    expect(statusLabel("DONE")).toBe("zaliczone");
  });

  it("źródła", () => {
    expect(sourceLabel("MANUAL")).toBe("zgłoszenie");
    expect(sourceLabel("CODE")).toBe("kod");
    expect(sourceLabel("ADMIN")).toBe("admin");
    expect(sourceLabel(null)).toBe("—");
  });
});

describe("resolveMessage", () => {
  it("znany klucz sukcesu z numerem koperty", () => {
    expect(resolveMessage("approved", "3")).toEqual({
      text: "Zatwierdzone — koperta 3 zaliczona, świeczka się pali.",
      error: false,
    });
  });

  it("znany klucz błędu", () => {
    expect(resolveMessage("stale", "")).toEqual({
      text: "Stan zadania zmienił się — odśwież stronę i sprawdź jeszcze raz.",
      error: true,
    });
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "nieznany", "", undefined])(
    "klucz spoza listy (%s) → undefined",
    (key) => {
      expect(resolveMessage(key, "1")).toBeUndefined();
    },
  );
});
