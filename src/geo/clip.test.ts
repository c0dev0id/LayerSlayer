import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { linesOutside } from './clip';

const square: LngLat[] = [
  [8, 48],
  [9, 48],
  [9, 49],
  [8, 49],
];

const close = (line: LngLat[]) => line.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]);

describe('linesOutside', () => {
  it('cuts a line crossing the polygon where it enters and leaves', () => {
    const parts = linesOutside([[[7, 48.5], [10, 48.5]]], square);
    expect(parts.map(close)).toEqual([
      [[7, 48.5], [8, 48.5]],
      [[9, 48.5], [10, 48.5]],
    ]);
  });

  it('keeps lines that pass the polygon by and drops those inside it', () => {
    const by: LngLat[] = [[7, 47], [10, 47]];
    expect(linesOutside([by, [[8.2, 48.2], [8.8, 48.8]]], square)).toEqual([by]);
  });

  it('keeps a line in one piece across its corners while it stays outside', () => {
    const parts = linesOutside([[[7, 47], [10, 47], [10, 48.5], [8.5, 48.5]]], square);
    expect(parts.map(close)).toEqual([[[7, 47], [10, 47], [10, 48.5], [9, 48.5]]]);
  });

  it('cuts along a meridian where Web Mercator draws the polygon edge, not halfway in degrees', () => {
    // An edge from 8,40 to 10,60 is straight on the map; in Mercator it crosses 9 °E north of 50 °N.
    const [, upper] = linesOutside([[[9, 30], [9, 70]]], [[8, 40], [10, 60], [10, 40]]);
    expect(upper![0]![1]).toBeGreaterThan(50.5);
  });
});
