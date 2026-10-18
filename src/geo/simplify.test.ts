import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { simplifyLine, simplifyToCount } from './simplify';

/** About 1 m in degrees at the equator. */
const M = 1 / 111_320;

describe('simplifyLine', () => {
  it('drops points within the tolerance and keeps the ends', () => {
    const line: LngLat[] = [
      [0, 0],
      [100 * M, 2 * M],
      [200 * M, 0],
    ];
    expect(simplifyLine(line, 5)).toEqual([line[0], line[2]]);
    expect(simplifyLine(line, 1)).toEqual(line);
  });

  it('keeps corners', () => {
    const line: LngLat[] = [
      [0, 0],
      [50 * M, 0],
      [100 * M, 0],
      [100 * M, 50 * M],
      [100 * M, 100 * M],
    ];
    expect(simplifyLine(line, 5)).toEqual([line[0], line[2], line[4]]);
  });

  it('leaves short lines as they are', () => {
    expect(simplifyLine([[1, 1]], 5)).toEqual([[1, 1]]);
    expect(simplifyLine([], 5)).toEqual([]);
  });
});

describe('simplifyToCount', () => {
  it('raises the tolerance until the line fits', () => {
    // A zigzag of 2000 points with 20 m teeth.
    const line: LngLat[] = Array.from({ length: 2000 }, (_, i) => [i * 10 * M, (i % 2) * 20 * M]);
    const simple = simplifyToCount(line, 500);
    expect(simple.length).toBeLessThanOrEqual(500);
    expect(simple[0]).toEqual(line[0]);
    expect(simple.at(-1)).toEqual(line.at(-1));
  });

  it('keeps as many points as fit, at the least tolerance from 5 m on', () => {
    // A winding line of 6000 points, 10 m apart, turning a little at each: 516 of them
    // are kept at 5 m, and 314 when doubling the tolerance to 10 m.
    let [x, y, heading, seed] = [0, 0, 0, 1];
    const line: LngLat[] = Array.from({ length: 6000 }, () => {
      seed = (seed * 16807) % 2147483647;
      heading += (seed / 2147483647 - 0.5) * 0.3;
      [x, y] = [x + Math.cos(heading) * 10, y + Math.sin(heading) * 10];
      return [x * M, y * M];
    });
    expect(simplifyToCount(line, 500)).toHaveLength(500);
    // Where 5 m keeps few enough, the line is not simplified further.
    expect(simplifyToCount(line, 600)).toEqual(simplifyLine(line, 5));
  });

  it('keeps lines that already fit', () => {
    const line: LngLat[] = [
      [0, 0],
      [1 * M, 1 * M],
      [2 * M, 0],
    ];
    expect(simplifyToCount(line, 500)).toEqual(line);
  });
});
