import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { codeForTask } from "@/lib/codes";
import {
  approve,
  completeWithCode,
  countPending,
  ensureStarted,
  getBoard,
  getPendingSubmissions,
  reject,
  resetAll,
  submit,
  undoLast,
} from "@/lib/progress";
import { truncateAll } from "./setup";

const photo = (n: number | string) => ({ path: `uploads/p${n}.jpg`, hash: `hash-${n}` });

const progressOf = (taskId: number) => prisma.taskProgress.findUniqueOrThrow({ where: { taskId } });

// Zalicza zadania 1..n-1 przez submit + approve, tak że n jest ACTIVE.
async function advanceTo(n: number) {
  for (let id = 1; id < n; id++) {
    const r = await submit(id, { photos: [photo(id)] });
    expect(r.ok).toBe(true);
    await approve(id);
  }
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("progress", () => {
  it("1. ensureStarted tworzy 28 wierszy: 1 ACTIVE z unlockedAt, reszta LOCKED; idempotentne", async () => {
    await ensureStarted();
    const rows = await prisma.taskProgress.findMany({ orderBy: { taskId: "asc" } });
    expect(rows).toHaveLength(28);
    expect(rows[0]).toMatchObject({ taskId: 1, status: "ACTIVE" });
    expect(rows[0].unlockedAt).toBeInstanceOf(Date);
    expect(rows.slice(1).every((r) => r.status === "LOCKED" && r.unlockedAt === null)).toBe(true);

    await ensureStarted();
    const again = await prisma.taskProgress.findMany({ orderBy: { taskId: "asc" } });
    expect(again).toHaveLength(28);
    expect(again.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
    expect(again[0].unlockedAt).toEqual(rows[0].unlockedAt);
  });

  it("2. getBoard ukrywa zadania LOCKED, revealLocked je ujawnia", async () => {
    await ensureStarted();
    const board = await getBoard();
    expect(board.done).toBe(0);
    expect(board.total).toBe(28);
    expect(board.tasks).toHaveLength(28);
    expect(board.tasks[0].title).toBeDefined();
    expect(board.tasks[0].proofHint).toBeDefined();
    expect(board.tasks[1].title).toBeUndefined();
    expect(Object.keys(board.tasks[1]).sort()).toEqual(["id", "stage", "status"]);

    const revealed = await getBoard({ revealLocked: true });
    expect(revealed.tasks[1].title).toBeDefined();
    expect(revealed.tasks[27].title).toBeDefined();
  });

  it("3. submit → PENDING_REVIEW, Submission PENDING, pending widoczny na tablicy", async () => {
    await ensureStarted();
    const r = await submit(1, { photos: [photo(1)], note: "nowe buty" });
    expect(r).toEqual({ ok: true, warnings: expect.any(Array) });
    expect((await progressOf(1)).status).toBe("PENDING_REVIEW");
    const subs = await prisma.submission.findMany({ where: { taskId: 1 } });
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      status: "PENDING",
      note: "nowe buty",
      photos: ["uploads/p1.jpg"],
      photoHashes: ["hash-1"],
    });

    const board = await getBoard();
    expect(board.tasks[0].status).toBe("PENDING_REVIEW");
    expect(board.tasks[0].pending?.photos).toHaveLength(1);
    expect(board.tasks[0].pending?.createdAt).toBeInstanceOf(Date);
  });

  it("4. brak zdjęcia przy PHOTO → photo_required; zadanie 21 (NONE) bez zdjęć → ok", async () => {
    await ensureStarted();
    expect(await submit(1, { photos: [] })).toEqual({ ok: false, error: "photo_required" });
    expect((await progressOf(1)).status).toBe("ACTIVE");

    await advanceTo(21);
    expect((await progressOf(21)).status).toBe("ACTIVE");
    const r = await submit(21, { photos: [] });
    expect(r.ok).toBe(true);
    expect((await progressOf(21)).status).toBe("PENDING_REVIEW");
  });

  it("5. submit zadania LOCKED → not_active; za dużo zdjęć → too_many_photos", async () => {
    await ensureStarted();
    expect(await submit(2, { photos: [photo(2)] })).toEqual({ ok: false, error: "not_active" });
    expect(await prisma.submission.count()).toBe(0);

    await advanceTo(8); // zadanie 8: maxPhotos 4
    const five = [1, 2, 3, 4, 5].map((i) => photo(`8-${i}`));
    expect(await submit(8, { photos: five })).toEqual({ ok: false, error: "too_many_photos" });
    expect((await submit(8, { photos: five.slice(0, 4) })).ok).toBe(true);
  });

  it("6. approve → DONE (MANUAL), Submission APPROVED, następne ACTIVE", async () => {
    await ensureStarted();
    await submit(1, { photos: [photo(1)] });
    await approve(1);

    const p1 = await progressOf(1);
    expect(p1).toMatchObject({ status: "DONE", source: "MANUAL" });
    expect(p1.completedAt).toBeInstanceOf(Date);
    const sub = await prisma.submission.findFirstOrThrow({ where: { taskId: 1 } });
    expect(sub.status).toBe("APPROVED");
    expect(sub.reviewedAt).toBeInstanceOf(Date);
    const p2 = await progressOf(2);
    expect(p2.status).toBe("ACTIVE");
    expect(p2.unlockedAt).toBeInstanceOf(Date);
    expect((await getBoard()).done).toBe(1);
  });

  it("6b. approve bez oczekującego zgłoszenia rzuca invalid_transition", async () => {
    await ensureStarted();
    await expect(approve(1)).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("7. reject → ACTIVE z powodem; ponowny submit czyści powód", async () => {
    await ensureStarted();
    await submit(1, { photos: [photo(1)] });
    await reject(1, "za mało");

    expect(await progressOf(1)).toMatchObject({ status: "ACTIVE", lastRejectReason: "za mało" });
    const sub = await prisma.submission.findFirstOrThrow({ where: { taskId: 1 } });
    expect(sub).toMatchObject({ status: "REJECTED", reviewNote: "za mało" });
    expect((await getBoard()).tasks[0].lastRejectReason).toBe("za mało");

    expect((await submit(1, { photos: [photo("1b")] })).ok).toBe(true);
    expect(await progressOf(1)).toMatchObject({ status: "PENDING_REVIEW", lastRejectReason: null });
  });

  it("8. approve zapisuje wynik; zgłoszenie 11 dostaje referencję z zadania 6", async () => {
    await ensureStarted();
    await advanceTo(6);
    await submit(6, { photos: [photo(6)], durationS: 760, distanceM: 2100 });
    await approve(6);
    expect(await progressOf(6)).toMatchObject({ resultSeconds: 760, resultDistanceM: 2100 });

    for (let id = 7; id < 11; id++) {
      await submit(id, { photos: [photo(id)] });
      await approve(id);
    }
    const r = await submit(11, { photos: [photo(11)], durationS: 740, distanceM: 2000 });
    expect(r).toEqual({
      ok: true,
      warnings: expect.arrayContaining(["Czas 12:20 nie jest szybszy o 30 s od referencji 12:40"]),
    });

    const pending = await getPendingSubmissions();
    expect(pending).toHaveLength(1);
    expect(pending[0].taskId).toBe(11);
    expect(pending[0].task.id).toBe(11);
    expect(pending[0].reference).toEqual({ taskId: 6, resultSeconds: 760 });
    expect(pending[0].minutesAfterUnlock).toBeGreaterThanOrEqual(0);
  });

  it("9. completeWithCode: dobry kod → DONE (CODE); zły → bad_code; 5 złych w 10 min → rate_limited", async () => {
    await ensureStarted();
    const secret = getEnv().CODES_SECRET;

    expect(await completeWithCode(1, codeForTask(secret, 1))).toEqual({ ok: true });
    expect(await progressOf(1)).toMatchObject({ status: "DONE", source: "CODE" });
    expect((await progressOf(2)).status).toBe("ACTIVE");

    expect(await completeWithCode(2, codeForTask(secret, 3))).toEqual({ ok: false, error: "bad_code" });
    expect(await prisma.codeAttempt.count({ where: { success: false } })).toBe(1);

    for (let i = 0; i < 4; i++) {
      expect(await completeWithCode(2, "AAAA-AAAA")).toEqual({ ok: false, error: "bad_code" });
    }
    expect(await completeWithCode(2, codeForTask(secret, 2))).toEqual({ ok: false, error: "rate_limited" });
    expect(await prisma.codeAttempt.count({ where: { success: false } })).toBe(5);
    expect((await progressOf(2)).status).toBe("ACTIVE");
  });

  it("9b. stare nieudane próby (> 10 min) nie blokują; kod działa też przy PENDING_REVIEW", async () => {
    await ensureStarted();
    const old = new Date(Date.now() - 11 * 60_000);
    await prisma.codeAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({ taskId: 1, success: false, createdAt: old })),
    });

    await submit(1, { photos: [photo(1)] });
    expect(await completeWithCode(1, codeForTask(getEnv().CODES_SECRET, 1))).toEqual({ ok: true });
    expect(await progressOf(1)).toMatchObject({ status: "DONE", source: "CODE" });
    const sub = await prisma.submission.findFirstOrThrow({ where: { taskId: 1 } });
    expect(sub).toMatchObject({ status: "APPROVED", reviewNote: "kod" });
  });

  it("9c. kod dla zadania LOCKED → not_active", async () => {
    await ensureStarted();
    expect(await completeWithCode(3, codeForTask(getEnv().CODES_SECRET, 3))).toEqual({
      ok: false,
      error: "not_active",
    });
  });

  it("10. undoLast cofa ostatnie DONE, następca wraca do LOCKED", async () => {
    await ensureStarted();
    expect(await undoLast()).toBeNull();

    await advanceTo(3);
    await submit(3, { photos: [photo(3)] });
    expect(await undoLast()).toBe(2);

    const p2 = await progressOf(2);
    expect(p2).toMatchObject({ status: "ACTIVE", completedAt: null, source: null });
    expect(p2.unlockedAt).toBeInstanceOf(Date);
    expect(await progressOf(3)).toMatchObject({ status: "LOCKED", unlockedAt: null });
    const sub3 = await prisma.submission.findFirstOrThrow({ where: { taskId: 3 } });
    expect(sub3).toMatchObject({ status: "REJECTED", reviewNote: "cofnięte przez admina" });
    expect((await getBoard()).done).toBe(1);
  });

  it("11. resetAll wraca do stanu startowego, czyści zgłoszenia i próby, loguje reset", async () => {
    await ensureStarted();
    await advanceTo(3);
    await completeWithCode(3, "ZZZZ-ZZZZ");
    await resetAll();

    const rows = await prisma.taskProgress.findMany({ orderBy: { taskId: "asc" } });
    expect(rows).toHaveLength(28);
    expect(rows[0].status).toBe("ACTIVE");
    expect(rows[0].unlockedAt).toBeInstanceOf(Date);
    expect(rows.slice(1).every((r) => r.status === "LOCKED")).toBe(true);
    expect(await prisma.submission.count()).toBe(0);
    expect(await prisma.codeAttempt.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "reset" } })).toBe(1);
  });

  it("12. zaliczenie 28 zadań → done 28, brak ACTIVE, wpis all_done", async () => {
    await ensureStarted();
    await advanceTo(28);
    await submit(28, { photos: [photo(28)] });
    await approve(28);

    const board = await getBoard();
    expect(board.done).toBe(28);
    expect(board.tasks.some((t) => t.status === "ACTIVE")).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "all_done" } })).toBe(1);
  });

  it("13. countPending liczy zadania PENDING_REVIEW", async () => {
    await ensureStarted();
    expect(await countPending()).toBe(0);
    await submit(1, { photos: [photo(1)] });
    expect(await countPending()).toBe(1);
    await approve(1);
    expect(await countPending()).toBe(0);
  });

  it("10b. undoLast po zaliczeniu 28 → 28 ACTIVE, bez następcy", async () => {
    await ensureStarted();
    await advanceTo(28);
    await submit(28, { photos: [photo(28)] });
    await approve(28);
    expect(await undoLast()).toBe(28);
    expect(await progressOf(28)).toMatchObject({ status: "ACTIVE", completedAt: null });
    expect((await getBoard()).done).toBe(27);
  });

  it("9d. próby kodu: sukces zapisuje CodeAttempt success i audyt code_ok, porażka — code_bad", async () => {
    await ensureStarted();
    await completeWithCode(1, "AAAA-AAAA");
    await completeWithCode(1, codeForTask(getEnv().CODES_SECRET, 1));
    expect(await prisma.codeAttempt.count({ where: { taskId: 1, success: true } })).toBe(1);
    expect(await prisma.codeAttempt.count({ where: { taskId: 1, success: false } })).toBe(1);
    const actions = (await prisma.auditLog.findMany({ where: { taskId: 1 } })).map((a) => `${a.actor}:${a.action}`);
    expect(actions).toEqual(expect.arrayContaining(["PLAYER:code_bad", "PLAYER:code_ok"]));
  });

  it("9e. kod przy PENDING_REVIEW przenosi wynik ze zgłoszenia", async () => {
    await ensureStarted();
    await advanceTo(6);
    await submit(6, { photos: [photo(6)], durationS: 760, distanceM: 2100 });
    expect(await completeWithCode(6, codeForTask(getEnv().CODES_SECRET, 6))).toEqual({ ok: true });
    expect(await progressOf(6)).toMatchObject({ status: "DONE", source: "CODE", resultSeconds: 760, resultDistanceM: 2100 });
  });

  it("7b. approve po odrzuceniu (sprzeczna akcja admina) → invalid_transition, stan bez zmian", async () => {
    await ensureStarted();
    await submit(1, { photos: [photo(1)] });
    await reject(1, "nie");
    await expect(approve(1)).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await progressOf(1)).toMatchObject({ status: "ACTIVE", lastRejectReason: "nie" });
    expect((await progressOf(2)).status).toBe("LOCKED");
  });

  it("audyt: submit i approve zostawiają wpisy", async () => {
    await ensureStarted();
    await submit(1, { photos: [photo(1)] });
    await approve(1);
    const actions = (await prisma.auditLog.findMany({ where: { taskId: 1 } })).map((a) => `${a.actor}:${a.action}`);
    expect(actions).toEqual(expect.arrayContaining(["PLAYER:submit", "ADMIN:approve"]));
  });
});
