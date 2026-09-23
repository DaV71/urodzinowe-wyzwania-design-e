import { describe, it, expect } from "vitest";
import { plural, formatDuration, parseDuration, formatKm } from "./text";

describe("plural", () => {
  const koperta = (n: number) => plural(n, "koperta", "koperty", "kopert");

  it.each([
    [1, "koperta"],
    [2, "koperty"],
    [5, "kopert"],
    [12, "kopert"],
    [22, "koperty"],
    [25, "kopert"],
    [0, "kopert"],
  ])("%i → %s", (n, expected) => {
    expect(koperta(n)).toBe(expected);
  });

  it("11–14 zawsze w formie many, 104 w formie few", () => {
    expect([11, 13, 14, 112].map(koperta)).toEqual(["kopert", "kopert", "kopert", "kopert"]);
    expect(koperta(104)).toBe("koperty");
  });
});

describe("formatDuration", () => {
  it("poniżej godziny: mm:ss", () => {
    expect(formatDuration(760)).toBe("12:40");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(0)).toBe("00:00");
  });

  it("od godziny: h:mm:ss", () => {
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(3600)).toBe("1:00:00");
  });
});

describe("parseDuration", () => {
  it("mm:ss i h:mm:ss", () => {
    expect(parseDuration("12:40")).toBe(760);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration(" 5:07 ")).toBe(307);
  });

  it("niepoprawne wejście → null", () => {
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("12:70")).toBeNull();
    expect(parseDuration("1:60:00")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("12")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
  });

  it("jest odwrotnością formatDuration", () => {
    for (const s of [0, 59, 760, 3599, 3723, 7384]) {
      expect(parseDuration(formatDuration(s))).toBe(s);
    }
  });
});

describe("formatKm", () => {
  it("metry → km z przecinkiem i dwoma miejscami", () => {
    expect(formatKm(2100)).toBe("2,10");
    expect(formatKm(5000)).toBe("5,00");
    expect(formatKm(42195)).toBe("42,20");
  });
});
