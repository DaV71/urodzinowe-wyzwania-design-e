import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { getEnv } from "@/lib/env";

export const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  // Alias: iPhone/Safari deklaruje zdjęcia HEIC jako image/heif.
  "image/heif": ".heic",
} as const;

export type AllowedType = keyof typeof ALLOWED;

// Typy kanoniczne — to, co rozpoznaje sygnatura bajtów (bez aliasów).
type CanonicalType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export const MAX_BYTES = 10 * 1024 * 1024;

// Jedyny akceptowany kształt nazwy pliku na dysku: <uuid>.<ext>.
export const UPLOAD_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|heic)$/;

const CONTENT_TYPES: Record<string, CanonicalType> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export class UploadError extends Error {
  constructor(public readonly reason: "type" | "size") {
    super(reason === "type" ? "Niedozwolony typ pliku" : "Plik jest za duży");
    this.name = "UploadError";
  }
}

function isAllowedType(type: string): type is AllowedType {
  return Object.hasOwn(ALLOWED, type);
}

function canonical(type: AllowedType): CanonicalType {
  return type === "image/heif" ? "image/heic" : type;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end)).toString("latin1");
}

// Typ rozpoznany z sygnatury (magic bytes) — źródło prawdy; `file.type` to tylko deklaracja klienta.
export function detectType(b: Uint8Array): CanonicalType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && ["ftypheic", "ftypheix", "ftypmif1"].includes(ascii(b, 4, 12))) return "image/heic";
  return null;
}

function uploadDir(dir?: string): string {
  return resolve(dir ?? getEnv().UPLOAD_DIR);
}

// Zapisuje zdjęcie jako <uuid>.<ext> w katalogu uploadów; `dir` wstrzykiwany w testach.
export async function saveUpload(file: File, dir?: string): Promise<{ path: string; hash: string }> {
  // Pusty typ (np. HEIC w części przeglądarek) jest dopuszczalny — rozstrzyga sygnatura.
  const declared = file.type;
  if (declared !== "" && !isAllowedType(declared)) throw new UploadError("type");
  if (file.size > MAX_BYTES) throw new UploadError("size");

  // Jeden przebieg po strumieniu: hash + bufor, z twardym limitem niezależnym od `file.size`.
  const hasher = createHash("sha256");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new UploadError("size");
      hasher.update(value);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = Buffer.concat(chunks, total);
  const detected = detectType(data);
  if (!detected) throw new UploadError("type");
  if (declared !== "" && canonical(declared as AllowedType) !== detected) throw new UploadError("type");

  const root = uploadDir(dir);
  await mkdir(root, { recursive: true });
  const name = `${randomUUID()}${ALLOWED[detected]}`;
  const target = resolve(root, name);
  // Zapis przez plik tymczasowy + rename: pod docelową nazwą nigdy nie ma częściowego pliku.
  const tmp = `${target}.tmp`;
  try {
    await writeFile(tmp, data, { flag: "wx" });
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return { path: name, hash: hasher.digest("hex") };
}

// Otwiera zapisany plik do odczytu; null dla nazw spoza wzorca, prób wyjścia poza katalog i braków.
export async function openUpload(
  path: string,
  dir?: string,
): Promise<{ stream: ReadableStream; contentType: string; size: number } | null> {
  const name = basename(path);
  if (name !== path || !UPLOAD_NAME_RE.test(name)) return null;

  const root = uploadDir(dir);
  const full = resolve(root, name);
  if (!full.startsWith(root + sep)) return null;

  let size: number;
  try {
    const info = await stat(full);
    if (!info.isFile()) return null;
    size = info.size;
  } catch {
    return null;
  }
  const ext = name.slice(name.lastIndexOf(".") + 1);
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return { stream, contentType: CONTENT_TYPES[ext], size };
}
