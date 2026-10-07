import { describe, expect, it } from 'vitest';
import { fitTransform } from './projective';

describe('fitTransform', () => {
  it('maps a unit square onto any quadrilateral exactly', () => {
    const from = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
    const to = [[1e6, 5e6], [1.2e6, 5.01e6], [1.19e6, 5.3e6], [0.98e6, 5.28e6]] as const;
    const t = fitTransform(from, to);
    from.forEach((p, i) => {
      const [x, y] = t(p);
      expect(x).toBeCloseTo(to[i]![0], 3);
      expect(y).toBeCloseTo(to[i]![1], 3);
    });
  });

  it('fits an affine transform to three pairs', () => {
    const t = fitTransform([[0, 0], [1, 0], [0, 1]], [[10, 20], [12, 20], [10, 23]]);
    const [x, y] = t([1, 1]);
    expect(x).toBeCloseTo(12);
    expect(y).toBeCloseTo(23);
  });

  it('rejects collinear points', () => {
    expect(() => fitTransform([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 1], [2, 2], [3, 3]])).toThrow(/plane/);
  });
});
