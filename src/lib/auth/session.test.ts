import { describe, it, expect } from "vitest";
import { signValue, verifyValue, safeEqual } from "./session";
import { verifyValueWeb, isValidSessionPayload, DAY_MS } from "./session-web";

const secret = "s".repeat(40);

describe("signValue / verifyValue", () => {
  it("podpisuje i weryfikuje payload", () => {
    const token = signValue("player:123", secret);
    expect(token.startsWith("player:123.")).toBe(true);
    expect(token).not.toMatch(/[=+/]/);
    expect(verifyValue(token, secret)).toBe("player:123");
  });
  it("zmieniony znak w podpisie → null", () => {
    const token = signValue("player:123", secret);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(verifyValue(tampered, secret)).toBeNull();
  });
  it("zmieniony payload → null", () => {
    const token = signValue("player:123", secret);
    expect(verifyValue(token.replace("player:123", "player:124"), secret)).toBeNull();
  });
  it("inny sekret → null", () => {
    expect(verifyValue(signValue("admin:1", secret), "x".repeat(40))).toBeNull();
  });
  it("brak kropki → null", () => {
    expect(verifyValue("bezkropki", secret)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("różne długości → false", () => expect(safeEqual("abc", "abcd")).toBe(false));
  it("różne wartości tej samej długości → false", () => expect(safeEqual("abcd", "abce")).toBe(false));
  it("równe → true", () => expect(safeEqual("tajne-haslo", "tajne-haslo")).toBe(true));
});

describe("verifyValueWeb (proxy, Web Crypto)", () => {
  it("weryfikuje wartość podpisaną przez session.ts", async () => {
    expect(await verifyValueWeb(signValue("admin:42", secret), secret)).toBe("admin:42");
  });
  it("odrzuca inny sekret, zmieniony podpis i brak kropki", async () => {
    const token = signValue("admin:42", secret);
    expect(await verifyValueWeb(token, "x".repeat(40))).toBeNull();
    expect(await verifyValueWeb(token.replace("admin:42", "admin:43"), secret)).toBeNull();
    expect(await verifyValueWeb("bezkropki", secret)).toBeNull();
  });
});

describe("isValidSessionPayload", () => {
  const now = 1_000 * DAY_MS;
  it("akceptuje świeży payload właściwej roli", () =>
    expect(isValidSessionPayload(`admin:${now - DAY_MS}`, "admin", 30 * DAY_MS, now)).toBe(true));
  it("odrzuca przeterminowany", () =>
    expect(isValidSessionPayload(`admin:${now - 31 * DAY_MS}`, "admin", 30 * DAY_MS, now)).toBe(false));
  it("odrzuca inną rolę, śmieci i null", () => {
    expect(isValidSessionPayload(`player:${now}`, "admin", 30 * DAY_MS, now)).toBe(false);
    expect(isValidSessionPayload("admin:abc", "admin", 30 * DAY_MS, now)).toBe(false);
    expect(isValidSessionPayload(`admin:${now}:x`, "admin", 30 * DAY_MS, now)).toBe(false);
    expect(isValidSessionPayload(null, "player", 120 * DAY_MS, now)).toBe(false);
  });
  it("odrzuca datę wystawienia z przyszłości", () =>
    expect(isValidSessionPayload(`player:${now + DAY_MS}`, "player", 120 * DAY_MS, now)).toBe(false));
});
