import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { focusAreaFeatures, focusDraftFeatures } from './focusOverlay';

const square: LngLat[] = [
  [8, 48],
  [9, 48],
  [9, 49],
  [8, 49],
];

/** Twice the signed area of a closed ring, positive when counterclockwise. */
const winding = (ring: GeoJSON.Position[]) => ring.slice(1).reduce((sum, [x2, y2], i) => sum + ring[i]![0]! * y2! - x2! * ring[i]![1]!, 0);

describe('focusAreaFeatures', () => {
  it('cuts the area out of the world against its winding, whichever way it was drawn', () => {
    for (const corners of [square, [...square].reverse()]) {
      const [mask, outline] = focusAreaFeatures(corners).features;
      const [world, hole] = (mask!.geometry as GeoJSON.Polygon).coordinates;
      expect(Math.sign(winding(world!))).toBe(1);
      expect(Math.sign(winding(hole!))).toBe(-1);
      expect(hole).toHaveLength(5);
      expect((outline!.geometry as GeoJSON.LineString).coordinates).toEqual([...corners, corners[0]]);
    }
  });

  it('has nothing to draw without an area', () => {
    expect(focusAreaFeatures(undefined).features).toEqual([]);
  });
});

describe('focusDraftFeatures', () => {
  it('draws the corners being placed, joined up to the pointer', () => {
    const { features } = focusDraftFeatures(square.slice(0, 2), [9, 49]);
    expect(features.map((f) => f.geometry.type)).toEqual(['LineString', 'Point', 'Point']);
    expect((features[0]!.geometry as GeoJSON.LineString).coordinates).toEqual([...square.slice(0, 2), [9, 49]]);
    expect(features.map((f) => f.properties)).toEqual([{}, { first: true }, { first: false }]);
  });

  it('has nothing to draw before the first corner, wherever the pointer is', () => {
    expect(focusDraftFeatures([], [1, 1]).features).toEqual([]);
  });
});
