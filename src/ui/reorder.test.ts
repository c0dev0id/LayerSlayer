import { describe, expect, it } from 'vitest';
import { reorderTarget } from './reorder';

describe('reorderTarget', () => {
  const mids = [10, 30, 50, 70];

  it('counts the other items above the pointer', () => {
    expect(reorderTarget(mids, 0, 5)).toBe(0);
    expect(reorderTarget(mids, 0, 40)).toBe(1);
    expect(reorderTarget(mids, 0, 99)).toBe(3);
    expect(reorderTarget(mids, 3, 20)).toBe(1);
  });
});
