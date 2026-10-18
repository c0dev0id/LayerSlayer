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
      // The outline runs counterclockwise, so that the outside of each edge is to its right.
      const outline = (ofKind(features, 'outline')[0]!.geometry as GeoJSON.LineString).coordinates;
      expect(Math.sign(winding(outline))).toBe(1);
      expect(outline).toHaveLength(5);
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

  it('draws the graticule and the world outline on the cover only, cut off at the area', () => {
    const world = { coastlines: [[[7, 48.5], [10, 48.5]]] as LngLat[][], borders: [] };
    const features = focusAreaFeatures(square, world).features;
    const rounded = (f: GeoJSON.Feature) => (f.geometry as GeoJSON.LineString).coordinates.map((p) => p.map((v) => Number(v.toFixed(6))));
    expect(ofKind(features, 'coast').map(rounded)).toEqual([
      [[7, 48.5], [8, 48.5]],
      [[9, 48.5], [10, 48.5]],
    ]);
    const grid = ofKind(features, 'grid').flatMap((f) => (f.geometry as GeoJSON.LineString).coordinates);
    expect(grid.length).toBeGreaterThan(0);
    expect(grid.some(([lng, lat]) => lng! > 8.001 && lng! < 8.999 && lat! > 48.001 && lat! < 48.999)).toBe(false);
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
