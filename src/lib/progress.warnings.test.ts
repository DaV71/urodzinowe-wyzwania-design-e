import { describe, it, expect } from "vitest";
import type { Task } from "@/generated/prisma/client";
import { computeWarnings } from "./progress.warnings";

function task(over: Partial<Task> = {}): Task {
  return {
    id: 3, stage: 1, title: "Bieg 1 km", description: "Opis", proof: "PHOTO", proofHint: "Screenshot",
    askDistance: false, askDuration: false, maxPhotos: 1, compareToTask: null, minImprovementS: null,
    minDistanceM: null, maxDurationS: null, ...over,
  };
}

const unlockedAt = new Date("2026-09-23T10:00:00Z");
const later = new Date("2026-09-23T12:00:00Z");
const photo = { path: "a.jpg", hash: "h1" };
const ctx = (over: Partial<Parameters<typeof computeWarnings>[2]> = {}) => ({
  unlockedAt, now: later, reference: null, knownHashes: new Set<string>(), ...over,
});

describe("computeWarnings", () => {
  it("poprawne zgłoszenie — brak ostrzeżeń", () => {
    const t = task({ minDistanceM: 3000, maxDurationS: 2400 });
    expect(computeWarnings(t, { photos: [photo], distanceM: 3200, durationS: 2000 }, ctx())).toEqual([]);
  });

  it("dystans poniżej progu", () => {
    const t = task({ minDistanceM: 3000 });
    expect(computeWarnings(t, { photos: [photo], distanceM: 2950 }, ctx())).toEqual([
      "Dystans 2,95 km poniżej progu 3 km",
    ]);
  });

  it("dystans równy progowi nie ostrzega", () => {
    const t = task({ minDistanceM: 3000 });
    expect(computeWarnings(t, { photos: [photo], distanceM: 3000 }, ctx())).toEqual([]);
  });

  it("czas powyżej limitu", () => {
    const t = task({ id: 26, maxDurationS: 2100 });
    expect(computeWarnings(t, { photos: [photo], durationS: 2165 }, ctx())).toEqual([
      "Czas 36:05 powyżej limitu 35:00",
    ]);
  });

  it("zgłoszenie mniej niż 5 min po odblokowaniu", () => {
    const now = new Date(unlockedAt.getTime() + 3 * 60_000 + 20_000);
    expect(computeWarnings(task(), { photos: [photo] }, ctx({ now }))).toEqual(["Zgłoszone 3 min po odblokowaniu"]);
  });

  it("zgłoszenie po 5 min nie ostrzega", () => {
    const now = new Date(unlockedAt.getTime() + 5 * 60_000);
    expect(computeWarnings(task(), { photos: [photo] }, ctx({ now }))).toEqual([]);
  });

  it("zdjęcie użyte już w innym zgłoszeniu (raz, nawet przy kilku duplikatach)", () => {
    const input = { photos: [photo, { path: "b.jpg", hash: "h2" }] };
    expect(computeWarnings(task(), input, ctx({ knownHashes: new Set(["h1", "h2"]) }))).toEqual([
      "Zdjęcie użyte już w innym zgłoszeniu",
    ]);
  });

  describe("zadanie 11 vs referencja z zadania 6", () => {
    const t11 = task({ id: 11, compareToTask: 6, minImprovementS: 30, minDistanceM: 2000 });

    it("740 s przy referencji 760 → ostrzeżenie", () => {
      expect(computeWarnings(t11, { photos: [photo], distanceM: 2000, durationS: 740 }, ctx({ reference: 760 }))).toEqual([
        "Czas 12:20 nie jest szybszy o 30 s od referencji 12:40",
      ]);
    });

    it("720 s przy referencji 760 → brak ostrzeżenia", () => {
      expect(computeWarnings(t11, { photos: [photo], distanceM: 2000, durationS: 720 }, ctx({ reference: 760 }))).toEqual([]);
    });

    it("brak referencji → brak ostrzeżenia", () => {
      expect(computeWarnings(t11, { photos: [photo], distanceM: 2000, durationS: 740 }, ctx())).toEqual([]);
    });
  });

  it("brak dystansu, gdy zadanie o niego prosi", () => {
    const t = task({ askDistance: true });
    expect(computeWarnings(t, { photos: [photo] }, ctx())).toEqual(["Nie podano dystansu"]);
  });

  it("brak czasu, gdy zadanie o niego prosi", () => {
    const t = task({ askDuration: true });
    expect(computeWarnings(t, { photos: [photo], distanceM: 1000 }, ctx())).toEqual(["Nie podano czasu"]);
  });

  it("podany dystans i czas przy askDistance/askDuration — brak ostrzeżeń", () => {
    const t = task({ askDistance: true, askDuration: true });
    expect(computeWarnings(t, { photos: [photo], distanceM: 1000, durationS: 300 }, ctx())).toEqual([]);
  });

  it("zadanie bez askDistance/askDuration nie wymaga wyników", () => {
    expect(computeWarnings(task(), { photos: [photo] }, ctx())).toEqual([]);
  });

  it("czas od godziny w formacie h:mm:ss", () => {
    const t = task({ maxDurationS: 3600 });
    expect(computeWarnings(t, { photos: [photo], durationS: 3725 }, ctx())).toEqual([
      "Czas 1:02:05 powyżej limitu 1:00:00",
    ]);
  });

  it("kilka ostrzeżeń naraz w stałej kolejności", () => {
    const t = task({ minDistanceM: 3000, maxDurationS: 2400, askDistance: true, askDuration: true });
    const now = new Date(unlockedAt.getTime() + 60_000);
    const w = computeWarnings(t, { photos: [photo], distanceM: 2500, durationS: 2500 }, ctx({ now, knownHashes: new Set(["h1"]) }));
    expect(w).toEqual([
      "Dystans 2,5 km poniżej progu 3 km",
      "Czas 41:40 powyżej limitu 40:00",
      "Zgłoszone 1 min po odblokowaniu",
      "Zdjęcie użyte już w innym zgłoszeniu",
    ]);
  });
});
