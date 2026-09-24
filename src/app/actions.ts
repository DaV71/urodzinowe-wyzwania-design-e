"use server";

import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { revalidatePath } from "next/cache";
import { isPlayer } from "@/lib/auth/player";
import { getEnv } from "@/lib/env";
import { completeWithCode, submit } from "@/lib/progress";
import { parseDuration } from "@/lib/text";
import { TASK_COUNT } from "@/lib/tasks";
import { UploadError, saveUpload } from "@/lib/uploads";

// Wynik akcji: kod błędu mapuje na komunikat SubmitForm.
export type SubmitState = { ok: true } | { error: string } | null;

// Najwięcej zdjęć, jakie dopuszcza jakiekolwiek zadanie — twardy limit przed zapisem na dysk.
const MAX_PHOTOS_ANY_TASK = 4;

const text = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

// "2,10" / "2.1" → metry (int); puste → undefined; zły format → null.
function parseDistance(input: string): number | undefined | null {
  if (input === "") return undefined;
  if (!/^\d{1,3}([.,]\d{1,3})?$/.test(input)) return null;
  return Math.round(Number(input.replace(",", ".")) * 1000);
}

async function removeUploads(paths: string[]): Promise<void> {
  const dir = resolve(getEnv().UPLOAD_DIR);
  await Promise.all(paths.map((p) => unlink(resolve(dir, p)).catch(() => {})));
}

export async function submitTaskAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  if (!(await isPlayer())) return { error: "forbidden" };

  const taskId = Number(text(formData, "taskId"));
  if (!Number.isInteger(taskId) || taskId < 1 || taskId > TASK_COUNT) return { error: "not_active" };

  const code = text(formData, "code");
  if (code !== "") {
    const res = await completeWithCode(taskId, code);
    revalidatePath("/");
    return res.ok ? { ok: true } : { error: res.error };
  }

  const distanceM = parseDistance(text(formData, "distanceKm"));
  if (distanceM === null) return { error: "bad_distance" };

  const durationRaw = text(formData, "duration");
  const durationS = durationRaw === "" ? undefined : parseDuration(durationRaw);
  if (durationS === null) return { error: "bad_duration" };

  // Przeglądarka wysyła pusty File, gdy nic nie wybrano.
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS_ANY_TASK) return { error: "too_many_photos" };

  // Wszystkie zdjęcia zapisane przed dotknięciem bazy; przy błędzie sprzątamy już zapisane.
  const photos: { path: string; hash: string }[] = [];
  try {
    for (const file of files) photos.push(await saveUpload(file));
  } catch (err) {
    await removeUploads(photos.map((p) => p.path));
    if (err instanceof UploadError) return { error: err.reason };
    throw err;
  }

  const note = text(formData, "note");
  let res: Awaited<ReturnType<typeof submit>>;
  try {
    res = await submit(taskId, { note: note === "" ? undefined : note.slice(0, 2000), photos, distanceM, durationS });
  } catch (err) {
    await removeUploads(photos.map((p) => p.path));
    throw err;
  }
  if (!res.ok) await removeUploads(photos.map((p) => p.path));
  revalidatePath("/");
  return res.ok ? { ok: true } : { error: res.error };
}
