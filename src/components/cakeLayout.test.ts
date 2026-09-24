import { describe, it, expect } from "vitest";
import { splitCandles } from "./cakeLayout";

const all = (s: ReturnType<typeof splitCandles>) => [
  ...s.top,
  ...s.middle.left,
  ...s.middle.right,
  ...s.bottom.left,
  ...s.bottom.right,
];

describe("splitCandles", () => {
  it("28 świeczek: 12 na wierzchu, po 4 na każdej półce", () => {
    const s = splitCandles(28);
    expect(s.top).toHaveLength(12);
    expect(s.middle.left).toHaveLength(4);
    expect(s.middle.right).toHaveLength(4);
    expect(s.bottom.left).toHaveLength(4);
    expect(s.bottom.right).toHaveLength(4);
  });

  it("każdy indeks występuje dokładnie raz, w kolejności zapalania", () => {
    expect(all(splitCandles(28))).toEqual(Array.from({ length: 28 }, (_, i) => i));
    expect(all(splitCandles(17))).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it("mało świeczek: wszystkie na wierzchu", () => {
    const s = splitCandles(6);
    expect(s.top).toHaveLength(6);
    expect(s.middle.left).toHaveLength(0);
    expect(s.bottom.right).toHaveLength(0);
  });

  it("więcej niż pojemność półek: nadmiar na wierzch", () => {
    const s = splitCandles(35);
    expect(s.top).toHaveLength(19);
    expect(all(s)).toHaveLength(35);
  });
});
