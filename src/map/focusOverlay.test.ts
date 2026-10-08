import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { FOCUS_SOURCE, focusFeatures, withFocus } from './focusOverlay';

const square: LngLat[] = [
  [8, 48],
  [9, 48],
  [9, 49],
  [8, 49],
];

/** Twice the signed area of a closed ring, positive when counterclockwise. */
const winding = (ring: GeoJSON.Position[]) => ring.slice(1).reduce((sum, [x2, y2], i) => sum + ring[i]![0]! * y2! - x2! * ring[i]![1]!, 0);

describe('focusFeatures', () => {
  it('cuts the area out of the world against its winding, whichever way it was drawn', () => {
    for (const corners of [square, [...square].reverse()]) {
      const [mask, outline] = focusFeatures(corners).features;
      const [world, hole] = (mask!.geometry as GeoJSON.Polygon).coordinates;
      expect(Math.sign(winding(world!))).toBe(1);
      expect(Math.sign(winding(hole!))).toBe(-1);
      expect(hole).toHaveLength(5);
      expect((outline!.geometry as GeoJSON.LineString).coordinates).toEqual([...corners, corners[0]]);
    }
  });

  it('draws the corners being placed, joined up to the pointer', () => {
    const { features } = focusFeatures(undefined, square.slice(0, 2), [9, 49]);
    expect(features.map((f) => f.geometry.type)).toEqual(['LineString', 'Point', 'Point']);
    expect((features[0]!.geometry as GeoJSON.LineString).coordinates).toEqual([...square.slice(0, 2), [9, 49]]);
    expect(features.map((f) => f.properties)).toEqual([{}, { first: true }, { first: false }]);
  });

  it('has nothing to draw without an area', () => {
    expect(focusFeatures(undefined, []).features).toEqual([]);
  });
});

describe('withFocus', () => {
  it('adds the area on top of the composed style', () => {
    const style = withFocus({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }] }, focusFeatures(square, square, [1, 1]));
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.layers[0]!.id).toBe('bg');
    expect(style.layers.slice(1).every((l) => 'source' in l && l.source === FOCUS_SOURCE)).toBe(true);
  });
});
