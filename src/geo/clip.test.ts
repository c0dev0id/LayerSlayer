import { describe, expect, it } from 'vitest';
import { insideRing, linesOutside } from './clip';
import type { XY } from './nearest';

const square: XY[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

describe('linesOutside', () => {
  it('cuts a line crossing the ring where it enters and leaves', () => {
    expect(linesOutside([[[-2, 2], [6, 2]]], square)).toEqual([
      [[-2, 2], [0, 2]],
      [[4, 2], [6, 2]],
    ]);
  });

  it('keeps lines that pass the ring by and drops those inside it', () => {
    const by: XY[] = [[-2, -1], [6, -1]];
    expect(linesOutside([by, [[1, 1], [3, 3]]], square)).toEqual([by]);
  });

  it('keeps a line in one piece across its corners while it stays outside', () => {
    expect(linesOutside([[[-2, -1], [6, -1], [6, 2], [2, 2]]], square)).toEqual([[[-2, -1], [6, -1], [6, 2], [4, 2]]]);
  });
});

describe('insideRing', () => {
  it('tells points inside a ring from those outside, also in a notch', () => {
    const notched: XY[] = [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4]];
    expect(insideRing([1, 1], notched)).toBe(true);
    expect(insideRing([2, 3], notched)).toBe(false);
    expect(insideRing([5, 1], notched)).toBe(false);
  });
});
