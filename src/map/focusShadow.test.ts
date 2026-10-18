import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { edgePoints, shadowColor, shadowLength } from './focusShadow';

describe('shadowColor', () => {
  it('casts a dark shadow on a light cover and a light glow on a dark one', () => {
    expect(shadowColor('#ffffff')).toMatch(/^rgba\(0, 0, 0,/);
    expect(shadowColor('#e9e4d8')).toMatch(/^rgba\(0, 0, 0,/);
    expect(shadowColor('#1b2b44')).toMatch(/^rgba\(255, 255, 255,/);
    expect(shadowColor('#000000')).toMatch(/^rgba\(255, 255, 255,/);
  });
});

describe('shadowLength', () => {
  it('shrinks with the area when zoomed out, and keeps its length once the area fills the view', () => {
    expect(shadowLength(9, 9)).toBe(28);
    expect(shadowLength(8, 9)).toBe(14);
    expect(shadowLength(6, 9)).toBe(3.5);
    expect(shadowLength(12, 9)).toBe(28);
  });
});

describe('edgePoints', () => {
  const corners: LngLat[] = [
    [0, 0],
    [10, 0],
    [10, 60],
  ];

  it('walks every edge in equal steps, starting at its corner', () => {
    const points = edgePoints(corners);
    expect(points).toHaveLength(3 * 16);
    expect(points[0]).toEqual([0, 0]);
    expect(points[8]![0]).toBeCloseTo(5);
    expect(points[16]).toEqual([10, 0]);
  });

  it('keeps an edge straight in Web Mercator, as the map draws it, rather than in degrees', () => {
    // Halfway up the meridian edge from 0 °N to 60 °N, the map is well north of 30 °N.
    expect(edgePoints(corners)[16 + 8]![1]).toBeGreaterThan(35);
  });
});
