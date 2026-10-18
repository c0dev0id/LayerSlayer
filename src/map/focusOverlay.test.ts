import { createPropertyExpression, latest, type Color, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import type { FillLayerSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { BACKGROUND_STATE } from './compose';
import { FOCUS_COVER_LAYER, focusAreaFeatures, focusAreaOverlay, focusDraftFeatures } from './focusOverlay';

const square: LngLat[] = [
  [8, 48],
  [9, 48],
  [9, 49],
  [8, 49],
];

const ofKind = (features: GeoJSON.Feature[], kind: string) => features.filter((f) => f.properties?.kind === kind);

/** Twice the signed area of a closed ring, positive when counterclockwise. */
const winding = (ring: GeoJSON.Position[]) => ring.slice(1).reduce((sum, [x2, y2], i) => sum + ring[i]![0]! * y2! - x2! * ring[i]![1]!, 0);

describe('focusAreaFeatures', () => {
  it('cuts the area out of the world against its winding, whichever way it was drawn', () => {
    for (const corners of [square, [...square].reverse()]) {
      const features = focusAreaFeatures(corners).features;
      const [world, hole] = (ofKind(features, 'cover')[0]!.geometry as GeoJSON.Polygon).coordinates;
      expect(Math.sign(winding(world!))).toBe(1);
      expect(Math.sign(winding(hole!))).toBe(-1);
      expect(hole).toHaveLength(5);
      // The edges run counterclockwise, so that the outside of each is to its right.
      const starts = ofKind(features, 'edge').map((e) => (e.geometry as GeoJSON.LineString).coordinates[0]!);
      expect(starts).toHaveLength(4);
      expect(Math.sign(winding([...starts, starts[0]!]))).toBe(1);
    }
  });

  it('lights the edges from the north-north-west', () => {
    const facing = (from: LngLat) =>
      ofKind(focusAreaFeatures(square).features, 'edge').find((e) => String((e.geometry as GeoJSON.LineString).coordinates[0]) === String(from))!.properties!.facing as number;
    const toLight = (25 * Math.PI) / 180;
    expect(facing([8, 49])).toBeCloseTo(Math.sin(toLight));
    expect(facing([9, 49])).toBeCloseTo(Math.cos(toLight));
    expect(facing([8, 48])).toBeCloseTo(-Math.cos(toLight));
    expect(facing([9, 48])).toBeCloseTo(-Math.sin(toLight));
  });

  /** The coastline the cover shows of `line` around `area`. */
  const coastOf = (area: LngLat[], line: LngLat[]) =>
    ofKind(focusAreaFeatures(area, { coastlines: [line], borders: [] }).features, 'coast').map((f) =>
      (f.geometry as GeoJSON.LineString).coordinates.map((p) => p.map((v) => Number(v.toFixed(6)))),
    );

  it('draws the world around a large area at the map scale, cut off at the area', () => {
    const large: LngLat[] = [[0, 30], [40, 30], [40, 60], [0, 60]];
    expect(coastOf(large, [[-10, 45], [50, 45]])).toEqual([
      [[-10, 45], [0, 45]],
      [[40, 45], [50, 45]],
    ]);
  });

  it('shrinks the world around a small area, as if it were raised over its place on a map at zoom 4', () => {
    // The square fills an 800 px view at about zoom 8.5, so the world shrinks 16 to 32 times.
    const [line] = coastOf(square, [[38.5, 48.5], [68.5, 48.5]]);
    const [near, far] = [(line![0]![0]! - 8.5) / 30, (line![1]![0]! - 8.5) / 60];
    expect(near).toBeCloseTo(far);
    expect(near).toBeGreaterThan(1 / 32);
    expect(near).toBeLessThan(1 / 16);
  });

  it('has nothing to draw without an area', () => {
    expect(focusAreaFeatures(undefined).features).toEqual([]);
  });
});

describe('the focus area cover', () => {
  it('is the map background, dimmed and opaque', () => {
    const cover = focusAreaOverlay.layers.find((l) => l.id === FOCUS_COVER_LAYER) as FillLayerSpecification;
    const spec = latest.paint_fill['fill-color'] as StylePropertySpecification;
    const color = createPropertyExpression(cover.paint!['fill-color'], 'fill-color', spec, { [BACKGROUND_STATE]: '#1b2b44' });
    if (color.result !== 'success') throw new Error('the cover colour does not compile');
    const { r, g, b, a } = color.value.evaluate({ zoom: 0 }) as Color;
    expect([r, g, b].map((c) => Math.round(c * 255))).toEqual([0x1b, 0x2b, 0x44].map((c) => Math.round(c * 0.6)));
    expect(a).toBe(1);
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
