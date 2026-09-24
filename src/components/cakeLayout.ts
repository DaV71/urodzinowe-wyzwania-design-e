// Rozkład świeczek na poziomy tortu: wierzch najwyższej warstwy + półki (lewa/prawa) niższych warstw.
// Świeczki zapalają się w kolejności: wierzch od lewej, potem półka środkowa (lewa, prawa), potem dolna.

export const TOP_CAPACITY = 12;
export const LEDGE_SIDE_CAPACITY = 4;

export type CandleSlots = {
  top: number[];
  middle: { left: number[]; right: number[] };
  bottom: { left: number[]; right: number[] };
};

function take(from: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => from + i);
}

/** Dzieli indeksy 0..total-1 na poziomy. Nadmiar ponad pojemność półek trafia na wierzch. */
export function splitCandles(total: number): CandleSlots {
  const ledges = Math.min(Math.max(total - TOP_CAPACITY, 0), LEDGE_SIDE_CAPACITY * 4);
  const top = total - ledges;
  const midCount = Math.min(ledges, LEDGE_SIDE_CAPACITY * 2);
  const botCount = ledges - midCount;

  let next = 0;
  const topIdx = take(next, top);
  next += top;
  const midLeft = take(next, Math.ceil(midCount / 2));
  next += midLeft.length;
  const midRight = take(next, midCount - midLeft.length);
  next += midRight.length;
  const botLeft = take(next, Math.ceil(botCount / 2));
  next += botLeft.length;
  const botRight = take(next, botCount - botLeft.length);

  return {
    top: topIdx,
    middle: { left: midLeft, right: midRight },
    bottom: { left: botLeft, right: botRight },
  };
}
