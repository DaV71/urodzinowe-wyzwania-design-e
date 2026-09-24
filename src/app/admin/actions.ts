"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminCookie, requireAdmin } from "@/lib/auth/admin";
import { ProgressError, approve, reject, resetAll, undoLast } from "@/lib/progress";
import { TASK_COUNT } from "@/lib/tasks";

// Akcje panelu przyjmują FormData (działają też bez JS). Wynik trafia do strony jako ?msg=… (komunikat na górze).

const MAX_REASON = 500;

const text = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

function taskIdFrom(formData: FormData): number | null {
  const id = Number(text(formData, "taskId"));
  return Number.isInteger(id) && id >= 1 && id <= TASK_COUNT ? id : null;
}

function refresh(): void {
  revalidatePath("/admin");
  revalidatePath("/");
}

function done(msg: string, task?: number | null, anchor = ""): never {
  redirect(`/admin?msg=${msg}${task ? `&task=${task}` : ""}${anchor}`);
}

// Sprzeczna akcja (np. zatwierdzenie już odrzuconego) → komunikat "stan się zmienił"; inne błędy lecą dalej.
async function guarded<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ProgressError) return { ok: false };
    throw err;
  }
}

export async function approveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const taskId = taskIdFrom(formData);
  if (taskId === null) done("bad_task");
  const res = await guarded(() => approve(taskId));
  refresh();
  done(res.ok ? "approved" : "stale", taskId);
}

export async function rejectAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const taskId = taskIdFrom(formData);
  if (taskId === null) done("bad_task");
  const reason = text(formData, "reason").slice(0, MAX_REASON);
  if (reason === "") done("no_reason", taskId, `#task-${taskId}`);
  const res = await guarded(() => reject(taskId, reason));
  refresh();
  done(res.ok ? "rejected" : "stale", taskId);
}

export async function undoAction(): Promise<void> {
  await requireAdmin();
  const res = await guarded(() => undoLast());
  refresh();
  if (!res.ok) done("stale", null, "#tablica");
  done(res.value === null ? "nothing_to_undo" : "undone", res.value, "#tablica");
}

export async function resetAction(formData: FormData): Promise<void> {
  await requireAdmin();
  if (text(formData, "confirm") !== "RESET") done("reset_word", null, "#reset");
  await resetAll();
  refresh();
  done("reset");
}

export async function logoutAction(): Promise<void> {
  await clearAdminCookie();
  redirect("/admin/login");
}
