import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { getEnv } from "@/lib/env";

export const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
} as const;

export type AllowedType = keyof typeof ALLOWED;

export const MAX_BYTES = 10 * 1024 * 1024;

// Jedyny akceptowany kształt nazwy pliku na dysku: <uuid>.<ext>.
export const UPLOAD_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|heic)$/;

const CONTENT_TYPES: Record<string, AllowedType> = {
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

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end)).toString("latin1");
}

// Sygnatura (magic bytes) musi pasować do zadeklarowanego typu — `file.type` to tylko deklaracja klienta.
function matchesSignature(type: AllowedType, b: Uint8Array): boolean {
  switch (type) {
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    case "image/webp":
      return b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    case "image/heic":
      return b.length >= 12 && ["ftypheic", "ftypheix", "ftypmif1"].includes(ascii(b, 4, 12));
  }
}

function uploadDir(dir?: string): string {
  return resolve(dir ?? getEnv().UPLOAD_DIR);
}

// Zapisuje zdjęcie jako <uuid>.<ext> w katalogu uploadów; `dir` wstrzykiwany w testach.
export async function saveUpload(file: File, dir?: string): Promise<{ path: string; hash: string }> {
  if (!isAllowedType(file.type)) throw new UploadError("type");
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
  if (!matchesSignature(file.type, data)) throw new UploadError("type");

  const root = uploadDir(dir);
  await mkdir(root, { recursive: true });
  const name = `${randomUUID()}${ALLOWED[file.type]}`;
  await writeFile(resolve(root, name), data, { flag: "wx" });
  return { path: name, hash: hasher.digest("hex") };
}

// Otwiera zapisany plik do odczytu; null dla nazw spoza wzorca, prób wyjścia poza katalog i braków.
export async function openUpload(
  path: string,
  dir?: string,
): Promise<{ stream: ReadableStream; contentType: string } | null> {
  const name = basename(path);
  if (name !== path || !UPLOAD_NAME_RE.test(name)) return null;

  const root = uploadDir(dir);
  const full = resolve(root, name);
  if (!full.startsWith(root + sep)) return null;

  try {
    if (!(await stat(full)).isFile()) return null;
  } catch {
    return null;
  }
  const ext = name.slice(name.lastIndexOf(".") + 1);
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return { stream, contentType: CONTENT_TYPES[ext] };
}
