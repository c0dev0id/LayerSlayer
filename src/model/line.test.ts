import { describe, expect, it } from 'vitest';
import { lineWidth } from './line';

describe('lineWidth', () => {
  it('keeps widths within bounds and falls back where none is usable', () => {
    expect(lineWidth(3, 4)).toBe(3);
    expect(lineWidth(500, 4)).toBe(10);
    expect(lineWidth(0, 4)).toBe(0.5);
    expect(lineWidth(undefined, 4)).toBe(4);
    expect(lineWidth('wide', 4)).toBe(4);
    expect(lineWidth(Number.NaN, 2.5)).toBe(2.5);
  });
});
