import { describe, it, expect } from "vitest";
import { allCodes, codeForTask, verifyCode } from "./codes";

const SECRET = "test-codes-secret-0123456789";

describe("codeForTask", () => {
  it("jest deterministyczny", () => {
    expect(codeForTask(SECRET, 5)).toBe(codeForTask(SECRET, 5));
  });
  it("różne zadania → różne kody", () => {
    const codes = new Set(Array.from({ length: 28 }, (_, i) => codeForTask(SECRET, i + 1)));
    expect(codes.size).toBe(28);
  });
  it("ma format XXXX-XXXX z alfabetu bez 0/O/1/I", () => {
    for (let id = 1; id <= 28; id++) {
      const code = codeForTask(SECRET, id);
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OI]/);
    }
  });
  it("inny sekret → inny kod", () => {
    expect(codeForTask("inny-sekret-abcdefghij", 1)).not.toBe(codeForTask(SECRET, 1));
  });
});

describe("verifyCode", () => {
  const code = codeForTask(SECRET, 3);
  const raw = code.replace("-", "");

  it("akceptuje kod w formacie XXXX-XXXX", () => {
    expect(verifyCode(SECRET, 3, code)).toBe(true);
  });
  it("akceptuje małe litery ze spacją zamiast myślnika", () => {
    const loose = `${raw.slice(0, 4)} ${raw.slice(4)}`.toLowerCase();
    expect(verifyCode(SECRET, 3, loose)).toBe(true);
  });
  it("akceptuje kod bez separatora i ze spacjami na brzegach", () => {
    expect(verifyCode(SECRET, 3, `  ${raw}  `)).toBe(true);
  });
  it("odrzuca kod innego zadania", () => {
    expect(verifyCode(SECRET, 4, code)).toBe(false);
  });
  it("odrzuca zły kod i pusty ciąg", () => {
    expect(verifyCode(SECRET, 3, "AAAA-AAAA")).toBe(false);
    expect(verifyCode(SECRET, 3, "")).toBe(false);
    expect(verifyCode(SECRET, 3, `${code}X`)).toBe(false);
  });
});

describe("allCodes", () => {
  it("zwraca 28 par taskId → kod", () => {
    const all = allCodes(SECRET);
    expect(all).toHaveLength(28);
    expect(all[0]).toEqual({ taskId: 1, code: codeForTask(SECRET, 1) });
    expect(all[27].taskId).toBe(28);
  });
});
