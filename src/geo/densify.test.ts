import { describe, expect, it } from 'vitest';
import { densify } from './densify';

describe('densify', () => {
  it('adds points so that none are farther apart than the spacing, keeping the line’s own points', () => {
    // About 100 m east, then 30 m north, at the equator.
    const east = 100 / 111_320;
    const north = 30 / 111_320;
    const { points, distances } = densify(
      [
        [0, 0],
        [east, 0],
        [east, north],
      ],
      25,
    );
    expect(points).toHaveLength(7);
    expect(points[4]).toEqual([east, 0]);
    expect(densify([[0, 0], [east, 0]], 25).original).toEqual([true, false, false, false, true]);
    expect(points.at(-1)).toEqual([east, north]);
    distances.forEach((d, i) => expect(d).toBeCloseTo([0, 25, 50, 75, 100, 115, 130][i]!, 6));
  });

  it('leaves a single point alone', () => {
    expect(densify([[7, 49]], 25)).toEqual({ points: [[7, 49]], distances: [0], original: [true] });
  });
});
