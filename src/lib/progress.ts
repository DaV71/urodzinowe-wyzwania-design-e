// Maszyna stanów postępu — jedyne miejsce zmieniające TaskProgress (SPEC §5).
// LOCKED → ACTIVE → (submit) PENDING_REVIEW → (approve) DONE | (reject) ACTIVE; ACTIVE/PENDING_REVIEW → (kod) DONE.
import type {
  Prisma,
  Proof,
  Source,
  Submission,
  SubmissionStatus,
  Task,
  TaskStatus,
} from "@/generated/prisma/client";
import { audit } from "./audit";
import { verifyCode } from "./codes";
import { prisma } from "./db";
import { getEnv } from "./env";
import { computeWarnings, type SubmitInput } from "./progress.warnings";
import { TASK_COUNT } from "./tasks";

export type { SubmitInput } from "./progress.warnings";

type Tx = Prisma.TransactionClient;

export type BoardTask = {
  id: number;
  stage: number;
  status: TaskStatus;
  title?: string;
  description?: string;
  proof?: Proof;
  proofHint?: string;
  askDistance?: boolean;
  askDuration?: boolean;
  maxPhotos?: number;
  source?: Source | null;
  resultSeconds?: number | null;
  resultDistanceM?: number | null;
  completedAt?: Date | null;
  lastRejectReason?: string | null;
  pending?: { createdAt: Date; photos: string[] } | null;
  /** Zatwierdzone zgłoszenie (podgląd dowodu) — tylko dla DONE; null, gdy zaliczono kodem bez zgłoszenia. */
  approved?: SubmissionView | null;
  /** Wszystkie zgłoszenia od najnowszego — tylko dla admina (`withHistory`). */
  history?: SubmissionView[];
};

export type SubmissionView = {
  id: string;
  status: SubmissionStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  photos: string[];
  note: string | null;
  distanceM: number | null;
  durationS: number | null;
  reviewNote: string | null;
  warnings: string[];
};

export type Board = { done: number; total: number; tasks: BoardTask[] };

export type ProgressErrorCode = "not_active" | "not_found" | "invalid_transition";

export class ProgressError extends Error {
  constructor(public code: ProgressErrorCode) {
    super(`Błąd postępu: ${code}`);
    this.name = "ProgressError";
  }
}

const CODE_WINDOW_MS = 10 * 60_000;
const CODE_MAX_FAILURES = 5;

const asStrings = (v: Prisma.JsonValue): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// Tworzy brakujące wiersze postępu; przy świeżym starcie odblokowuje zadanie 1.
async function startInTx(tx: Tx): Promise<boolean> {
  const created = await tx.taskProgress.createMany({
    data: Array.from({ length: TASK_COUNT }, (_, i) => ({ taskId: i + 1, status: "LOCKED" as const })),
    skipDuplicates: true,
  });
  if (created.count === 0) return false;
  const started = await tx.taskProgress.count({ where: { status: { not: "LOCKED" } } });
  if (started === 0) {
    // Warunkowo: przy dwóch równoległych startach tylko jeden odblokuje zadanie 1 i zapisze audyt.
    const unlocked = await tx.taskProgress.updateMany({
      where: { taskId: 1, status: "LOCKED" },
      data: { status: "ACTIVE", unlockedAt: new Date() },
    });
    if (unlocked.count === 1) await audit("SYSTEM", "start", null, undefined, tx);
  }
  return true;
}

export async function ensureStarted(): Promise<void> {
  if ((await prisma.taskProgress.count()) >= TASK_COUNT) return;
  await prisma.$transaction((tx) => startInTx(tx));
}

function toView(s: Submission): SubmissionView {
  return {
    id: s.id,
    status: s.status,
    createdAt: s.createdAt,
    reviewedAt: s.reviewedAt,
    photos: asStrings(s.photos),
    note: s.note,
    distanceM: s.distanceM,
    durationS: s.durationS,
    reviewNote: s.reviewNote,
    warnings: asStrings(s.warnings),
  };
}

export async function getBoard(opts: { revealLocked?: boolean; withHistory?: boolean } = {}): Promise<Board> {
  await ensureStarted();
  const rows = await prisma.taskProgress.findMany({
    orderBy: { taskId: "asc" },
    include: {
      // Od najnowszego: pierwsze PENDING to bieżące zgłoszenie, pierwsze APPROVED — zatwierdzony dowód.
      task: { include: { submissions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } },
    },
  });

  const tasks = rows.map((p): BoardTask => {
    const t = p.task;
    // Tytuły/opisy zadań LOCKED nigdy nie wychodzą poza serwer (chyba że admin prosi o podgląd).
    if (p.status === "LOCKED" && !opts.revealLocked) return { id: t.id, stage: t.stage, status: p.status };
    const pending = t.submissions.find((s) => s.status === "PENDING");
    const approved = t.submissions.find((s) => s.status === "APPROVED");
    return {
      id: t.id,
      stage: t.stage,
      status: p.status,
      title: t.title,
      description: t.description,
      proof: t.proof,
      proofHint: t.proofHint,
      askDistance: t.askDistance,
      askDuration: t.askDuration,
      maxPhotos: t.maxPhotos,
      source: p.source,
      resultSeconds: p.resultSeconds,
      resultDistanceM: p.resultDistanceM,
      completedAt: p.completedAt,
      lastRejectReason: p.lastRejectReason,
      pending: pending ? { createdAt: pending.createdAt, photos: asStrings(pending.photos) } : null,
      ...(p.status === "DONE" ? { approved: approved ? toView(approved) : null } : {}),
      ...(opts.withHistory ? { history: t.submissions.map(toView) } : {}),
    };
  });

  return { done: rows.filter((p) => p.status === "DONE").length, total: TASK_COUNT, tasks };
}

export async function countPending(): Promise<number> {
  return prisma.taskProgress.count({ where: { status: "PENDING_REVIEW" } });
}

// DONE bieżącego zadania → odblokowanie następnego; po 28. wpis all_done.
async function completeInTx(
  tx: Tx,
  taskId: number,
  from: TaskStatus[],
  data: { source: Source; resultSeconds?: number | null; resultDistanceM?: number | null },
): Promise<void> {
  const now = new Date();
  await transition(tx, taskId, from, {
    status: "DONE",
    completedAt: now,
    source: data.source,
    resultSeconds: data.resultSeconds ?? null,
    resultDistanceM: data.resultDistanceM ?? null,
    lastRejectReason: null,
  });
  if (taskId + 1 <= TASK_COUNT) {
    await tx.taskProgress.updateMany({
      where: { taskId: taskId + 1, status: "LOCKED" },
      data: { status: "ACTIVE", unlockedAt: now },
    });
  }
  if ((await tx.taskProgress.count({ where: { status: "DONE" } })) === TASK_COUNT) {
    await audit("SYSTEM", "all_done", null, undefined, tx);
  }
}

// Każde przejście jest warunkowe na stanie źródłowym: równoległa sprzeczna akcja (np. approve + reject)
// nie znajdzie wiersza, rzuci invalid_transition i wycofa całą transakcję.
async function transition(
  tx: Tx,
  taskId: number,
  from: TaskStatus[],
  data: Prisma.TaskProgressUpdateManyMutationInput,
): Promise<void> {
  const res = await tx.taskProgress.updateMany({ where: { taskId, status: { in: from } }, data });
  if (res.count !== 1) throw new ProgressError("invalid_transition");
}

async function reviewSubmission(
  tx: Tx,
  id: string,
  data: Prisma.SubmissionUpdateManyMutationInput,
): Promise<void> {
  const res = await tx.submission.updateMany({ where: { id, status: "PENDING" }, data });
  if (res.count !== 1) throw new ProgressError("invalid_transition");
}

async function getProgressOrThrow(tx: Tx, taskId: number) {
  const progress = await tx.taskProgress.findUnique({ where: { taskId }, include: { task: true } });
  if (!progress) throw new ProgressError("not_found");
  return progress;
}

export async function submit(
  taskId: number,
  input: SubmitInput,
): Promise<{ ok: true; warnings: string[] } | { ok: false; error: "not_active" | "photo_required" | "too_many_photos" }> {
  return prisma.$transaction(async (tx) => {
    const progress = await tx.taskProgress.findUnique({ where: { taskId }, include: { task: true } });
    if (!progress || progress.status !== "ACTIVE") return { ok: false, error: "not_active" } as const;
    const task = progress.task;
    if (input.photos.length > task.maxPhotos) return { ok: false, error: "too_many_photos" } as const;
    if (task.proof === "PHOTO" && input.photos.length === 0) return { ok: false, error: "photo_required" } as const;

    // Warunkowe przejście chroni przed podwójnym zgłoszeniem przy równoległych żądaniach.
    const moved = await tx.taskProgress.updateMany({
      where: { taskId, status: "ACTIVE" },
      data: { status: "PENDING_REVIEW", lastRejectReason: null },
    });
    if (moved.count !== 1) return { ok: false, error: "not_active" } as const;

    const others = await tx.submission.findMany({ where: { taskId: { not: taskId } }, select: { photoHashes: true } });
    const knownHashes = new Set(others.flatMap((s) => asStrings(s.photoHashes)));
    const reference =
      task.compareToTask != null
        ? ((await tx.taskProgress.findUnique({ where: { taskId: task.compareToTask } }))?.resultSeconds ?? null)
        : null;
    const now = new Date();
    const warnings = computeWarnings(task, input, {
      unlockedAt: progress.unlockedAt ?? now,
      now,
      reference,
      knownHashes,
    });

    await tx.submission.create({
      data: {
        taskId,
        note: input.note ?? null,
        photos: input.photos.map((p) => p.path),
        photoHashes: input.photos.map((p) => p.hash),
        distanceM: input.distanceM ?? null,
        durationS: input.durationS ?? null,
        warnings,
        createdAt: now,
      },
    });
    await audit("PLAYER", "submit", taskId, { photos: input.photos.length, warnings }, tx);
    return { ok: true, warnings } as const;
  });
}

async function latestPending(tx: Tx, taskId: number) {
  return tx.submission.findFirst({ where: { taskId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
}

export async function approve(taskId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const progress = await getProgressOrThrow(tx, taskId);
    if (progress.status !== "PENDING_REVIEW") throw new ProgressError("invalid_transition");
    const sub = await latestPending(tx, taskId);
    if (!sub) throw new ProgressError("invalid_transition");

    await reviewSubmission(tx, sub.id, { status: "APPROVED", reviewedAt: new Date() });
    await completeInTx(tx, taskId, ["PENDING_REVIEW"], { source: "MANUAL", resultSeconds: sub.durationS, resultDistanceM: sub.distanceM });
    await audit("ADMIN", "approve", taskId, { submissionId: sub.id }, tx);
  });
}

export async function reject(taskId: number, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const progress = await getProgressOrThrow(tx, taskId);
    if (progress.status !== "PENDING_REVIEW") throw new ProgressError("invalid_transition");
    const sub = await latestPending(tx, taskId);
    if (!sub) throw new ProgressError("invalid_transition");

    await reviewSubmission(tx, sub.id, { status: "REJECTED", reviewedAt: new Date(), reviewNote: reason });
    await transition(tx, taskId, ["PENDING_REVIEW"], { status: "ACTIVE", lastRejectReason: reason });
    await audit("ADMIN", "reject", taskId, { submissionId: sub.id, reason }, tx);
  });
}

export async function completeWithCode(
  taskId: number,
  code: string,
): Promise<{ ok: true } | { ok: false; error: "bad_code" | "rate_limited" | "not_active" }> {
  return prisma.$transaction(async (tx) => {
    // Limit globalny (nie per zadanie): ≥ 5 nieudanych prób w 10 min → bez sprawdzania kodu.
    const failures = await tx.codeAttempt.count({
      where: { success: false, createdAt: { gte: new Date(Date.now() - CODE_WINDOW_MS) } },
    });
    if (failures >= CODE_MAX_FAILURES) return { ok: false, error: "rate_limited" } as const;

    const progress = await tx.taskProgress.findUnique({ where: { taskId } });
    if (!progress || (progress.status !== "ACTIVE" && progress.status !== "PENDING_REVIEW")) {
      return { ok: false, error: "not_active" } as const;
    }

    const ok = verifyCode(getEnv().CODES_SECRET, taskId, code);
    await tx.codeAttempt.create({ data: { taskId, success: ok } });
    if (!ok) {
      await audit("PLAYER", "code_bad", taskId, undefined, tx);
      return { ok: false, error: "bad_code" } as const;
    }

    // Przy PENDING_REVIEW kod zatwierdza oczekujące zgłoszenie i przejmuje jego wynik (np. referencja zad. 6 → 11).
    const sub = progress.status === "PENDING_REVIEW" ? await latestPending(tx, taskId) : null;
    await tx.submission.updateMany({
      where: { taskId, status: "PENDING" },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewNote: "kod" },
    });
    await completeInTx(tx, taskId, [progress.status], {
      source: "CODE",
      resultSeconds: sub?.durationS,
      resultDistanceM: sub?.distanceM,
    });
    await audit("PLAYER", "code_ok", taskId, undefined, tx);
    return { ok: true } as const;
  });
}

// Cofa tylko ostatnie DONE; jego następca (ACTIVE/PENDING_REVIEW) wraca do LOCKED.
// `expectedTaskId` (z potwierdzenia w panelu): gdy ostatnie DONE jest inne → invalid_transition, nic się nie zmienia.
export async function undoLast(expectedTaskId?: number): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.taskProgress.findFirst({ where: { status: "DONE" }, orderBy: { taskId: "desc" } });
    if (expectedTaskId !== undefined && last?.taskId !== expectedTaskId) {
      throw new ProgressError("invalid_transition");
    }
    if (!last) return null;
    const taskId = last.taskId;

    await transition(tx, taskId, ["DONE"], {
      status: "ACTIVE",
      completedAt: null,
      source: null,
      resultSeconds: null,
      resultDistanceM: null,
      lastRejectReason: null,
    });

    const nextId = taskId + 1;
    if (nextId <= TASK_COUNT) {
      const relocked = await tx.taskProgress.updateMany({
        where: { taskId: nextId, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
        data: { status: "LOCKED", unlockedAt: null, lastRejectReason: null },
      });
      if (relocked.count > 0) {
        await tx.submission.updateMany({
          where: { taskId: nextId, status: "PENDING" },
          data: { status: "REJECTED", reviewedAt: new Date(), reviewNote: "cofnięte przez admina" },
        });
      }
    }

    await audit("ADMIN", "undo", taskId, undefined, tx);
    return taskId;
  });
}

// Pełny reset gry (dziennik zdarzeń zostaje).
export async function resetAll(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.submission.deleteMany({});
    await tx.codeAttempt.deleteMany({});
    await tx.taskProgress.deleteMany({});
    await startInTx(tx);
    await audit("ADMIN", "reset", null, undefined, tx);
  });
}

export async function getPendingSubmissions(): Promise<
  Array<
    Submission & {
      task: Task;
      reference?: { taskId: number; resultSeconds: number } | null;
      minutesAfterUnlock: number;
    }
  >
> {
  const subs = await prisma.submission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { task: { include: { progress: true } } },
  });
  const refIds = [...new Set(subs.map((s) => s.task.compareToTask).filter((id): id is number => id != null))];
  const refs = refIds.length
    ? await prisma.taskProgress.findMany({ where: { taskId: { in: refIds } } })
    : [];
  const refById = new Map(refs.map((r) => [r.taskId, r.resultSeconds]));

  return subs.map(({ task: { progress, ...task }, ...sub }) => {
    const refSeconds = task.compareToTask != null ? refById.get(task.compareToTask) : null;
    const unlockedAt = progress?.unlockedAt;
    return {
      ...sub,
      task,
      reference:
        task.compareToTask != null && refSeconds != null
          ? { taskId: task.compareToTask, resultSeconds: refSeconds }
          : null,
      minutesAfterUnlock: unlockedAt ? Math.round((sub.createdAt.getTime() - unlockedAt.getTime()) / 60_000) : 0,
    };
  });
}
