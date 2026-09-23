import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_BYTES, UploadError, openUpload, saveUpload } from "./uploads";

// Katalog uploadów wstrzykiwany parametrem `dir` — bez zależności od getEnv().
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "uploads-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 1, 2, 3]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Uint8Array.from([...Buffer.from("RIFF"), 0x10, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);
const HEIC = Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("mif1heic")]);

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function expectUploadError(p: Promise<unknown>, reason: "type" | "size") {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UploadError);
  expect((err as UploadError).reason).toBe(reason);
}

describe("saveUpload", () => {
  it("zapisuje JPEG pod nazwą UUID i zwraca hash SHA-256 zawartości", async () => {
    const res = await saveUpload(new File([JPEG], "zdjecie.jpg", { type: "image/jpeg" }), dir);
    expect(res.path).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(res.hash).toBe(sha256(JPEG));
    const saved = await readFile(join(dir, res.path));
    expect(new Uint8Array(saved)).toEqual(JPEG);
  });

  it("tworzy brakujący katalog (mkdir -p)", async () => {
    const nested = join(dir, "a", "b");
    const res = await saveUpload(new File([PNG], "x.png", { type: "image/png" }), nested);
    expect(res.path).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect((await stat(join(nested, res.path))).isFile()).toBe(true);
  });

  it.each([
    ["image/png", PNG, ".png"],
    ["image/webp", WEBP, ".webp"],
    ["image/heic", HEIC, ".heic"],
  ] as const)("akceptuje %s z poprawną sygnaturą", async (type, bytes, ext) => {
    const res = await saveUpload(new File([bytes], "f", { type }), dir);
    expect(res.path.endsWith(ext)).toBe(true);
  });

  it("pusty type + bajty HEIC → typ z sygnatury (.heic)", async () => {
    const res = await saveUpload(new File([HEIC], "IMG_0001", { type: "" }), dir);
    expect(res.path).toMatch(/^[0-9a-f-]{36}\.heic$/);
  });

  it("pusty type + HTML → type", async () => {
    await expectUploadError(saveUpload(new File(["<html></html>"], "x", { type: "" }), dir), "type");
  });

  it("image/heif + bajty HEIC → akceptuje jako .heic", async () => {
    const res = await saveUpload(new File([HEIC], "IMG.HEIF", { type: "image/heif" }), dir);
    expect(res.path).toMatch(/^[0-9a-f-]{36}\.heic$/);
  });

  it("po odrzuceniu (type/size) katalog pozostaje pusty", async () => {
    await expectUploadError(saveUpload(new File([PNG], "a.jpg", { type: "image/jpeg" }), dir), "type");
    await expectUploadError(saveUpload(new File(["hej"], "a.txt", { type: "text/plain" }), dir), "type");
    const big = new Uint8Array(MAX_BYTES + 1);
    big.set(JPEG);
    await expectUploadError(saveUpload(new File([big], "big.jpg", { type: "image/jpeg" }), dir), "size");
    expect(await readdir(dir)).toEqual([]);
  });

  it("twardy limit w pętli: plik kłamiący o size → size", async () => {
    class LyingFile extends File {
      get size() {
        return 1;
      }
    }
    const big = new Uint8Array(11 * 1024 * 1024);
    big.set(JPEG);
    const lying = new LyingFile([big], "big.jpg", { type: "image/jpeg" });
    expect(lying.size).toBe(1);
    await expectUploadError(saveUpload(lying, dir), "size");
    expect(await readdir(dir)).toEqual([]);
  });

  it("odrzuca text/plain jako typ", async () => {
    await expectUploadError(saveUpload(new File(["hej"], "a.txt", { type: "text/plain" }), dir), "type");
  });

  it("odrzuca plik, którego sygnatura nie pasuje do deklarowanego typu", async () => {
    await expectUploadError(saveUpload(new File([PNG], "a.jpg", { type: "image/jpeg" }), dir), "type");
    await expectUploadError(
      saveUpload(new File(["<html>nie obrazek</html>"], "a.png", { type: "image/png" }), dir),
      "type",
    );
  });

  it("odrzuca plik 11 MB jako rozmiar", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    big.set(JPEG);
    expect(big.byteLength).toBeGreaterThan(MAX_BYTES);
    await expectUploadError(saveUpload(new File([big], "big.jpg", { type: "image/jpeg" }), dir), "size");
  });
});

describe("openUpload", () => {
  it("zwraca strumień i typ zawartości dla zapisanego pliku", async () => {
    const { path } = await saveUpload(new File([JPEG], "z.jpg", { type: "image/jpeg" }), dir);
    const res = await openUpload(path, dir);
    expect(res).not.toBeNull();
    expect(res!.contentType).toBe("image/jpeg");
    expect(res!.size).toBe(JPEG.byteLength);
    const body = new Uint8Array(await new Response(res!.stream).arrayBuffer());
    expect(body).toEqual(JPEG);
  });

  it("zwraca null dla path traversal", async () => {
    expect(await openUpload("../../etc/passwd", dir)).toBeNull();
  });

  it("zwraca null dla nazwy spoza wzorca, nawet jeśli plik istnieje", async () => {
    await writeFile(join(dir, "secret.jpg"), JPEG);
    expect(await openUpload("secret.jpg", dir)).toBeNull();
  });

  it("zwraca null dla nieistniejącego pliku", async () => {
    expect(await openUpload("00000000-0000-4000-8000-000000000000.jpg", dir)).toBeNull();
  });
});
