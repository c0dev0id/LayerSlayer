import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { createLayer, type Layer } from '../model/layer';
import { featuresAt } from './layerFeatures';

const line = (x: number): GeoJSON.LineString => ({ type: 'LineString', coordinates: [[x, 0], [x + 1, 0]] });

/**
 * A map that answers queries with the given features, as MapLibre gives them: rendered
 * ones in the style layers asked for, whose source is the part of their id before the slash.
 */
function fakeMap(rendered: { layer: string; properties: object; geometry: GeoJSON.Geometry }[], source: Record<string, { properties: object; geometry: GeoJSON.Geometry }[]> = {}) {
  const sourceOf = (id: string) => id.split('/')[0]!;
  return {
    getLayersOrder: () => [...new Set(rendered.map((f) => f.layer))],
    getLayer: (id: string) => ({ source: sourceOf(id) }),
    queryRenderedFeatures: (_box: unknown, { layers }: { layers: string[] }) =>
      rendered.filter((f) => layers.includes(f.layer)).map((f) => ({ ...f, source: sourceOf(f.layer), layer: { id: f.layer } })),
    querySourceFeatures: (id: string) => source[id] ?? [],
  } as unknown as MapLibreMap;
}

const layers: Layer[] = [
  createLayer({ name: 'Base', source: { type: 'style', url: 'https://s.example/style.json' } }, [], 'base'),
  createLayer({ name: 'Closures', source: { type: 'geojson', data: { url: 'https://d.example/c.geojson' } } }, [], 'c'),
];

describe('featuresAt', () => {
  it('finds the features of vector layers once, though drawn as line and label', () => {
    const closure = { name: '58285 -Ennepetal' };
    const map = fakeMap([
      { layer: 'base/roads', properties: { name: 'B 7' }, geometry: line(0) },
      { layer: 'c/line-label', properties: closure, geometry: line(1) },
      { layer: 'c/line', properties: closure, geometry: line(1) },
      { layer: 'c/point', properties: { name: 'Sign' }, geometry: { type: 'Point', coordinates: [1, 0] } },
    ]);
    const found = featuresAt(map, { x: 10, y: 10 }, 10, layers);
    expect(found.map((f) => [f.layer, f.title])).toEqual([
      ['Closures', 'Closed to motorcycles'],
      ['Closures', 'Sign'],
    ]);
  });

  it('joins the parts of a line in the tiles loaded', () => {
    const props = { name: 'Long road' };
    const map = fakeMap([{ layer: 'c/line', properties: props, geometry: line(1) }], {
      c: [
        { properties: props, geometry: line(1) },
        { properties: props, geometry: line(2) },
        { properties: { name: 'Other' }, geometry: line(3) },
      ],
    });
    expect(featuresAt(map, { x: 0, y: 0 }, 10, layers)[0]!.geometry).toEqual({ type: 'GeometryCollection', geometries: [line(1), line(2)] });
  });

  it('finds what the map draws, as a layer shown alone though its eye is off', () => {
    const map = fakeMap([{ layer: 'c/line', properties: { name: 'Road' }, geometry: line(1) }]);
    expect(featuresAt(map, { x: 0, y: 0 }, 10, [layers[0]!, { ...layers[1]!, visible: false }]).map((f) => f.title)).toEqual(['Road']);
  });

  it('takes a point as drawn, as points have no parts to join', () => {
    const map = fakeMap([{ layer: 'c/point', properties: { name: 'Sign' }, geometry: { type: 'Point', coordinates: [1, 0] } }], {
      c: [{ properties: { name: 'Sign' }, geometry: { type: 'Point', coordinates: [1, 0] } }, { properties: { name: 'Sign' }, geometry: { type: 'Point', coordinates: [1, 0] } }],
    });
    expect(featuresAt(map, { x: 0, y: 0 }, 10, layers)[0]!.geometry).toEqual({ type: 'Point', coordinates: [1, 0] });
  });
});
