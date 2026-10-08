import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { keepLoadedGeoJson } from './geojsonDiff';

const style = (sources: StyleSpecification['sources']): StyleSpecification => ({ version: 8, sources, layers: [] });
const loaded = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;

describe('keepLoadedGeoJson', () => {
  it('shows a diff the address a source was loaded from, while the next style gives the same', () => {
    const transform = keepLoadedGeoJson();
    const first = style({ a: { type: 'geojson', data: 'blob:a' }, b: { type: 'geojson', data: 'blob:b' } });
    expect(transform(undefined, first)).toBe(first);

    // MapLibre's current style holds the loaded data in place of the addresses.
    const current = style({ a: { type: 'geojson', data: loaded }, b: { type: 'geojson', data: loaded } });
    const next = style({ a: { type: 'geojson', data: 'blob:a' }, b: { type: 'geojson', data: 'blob:b2' } });
    expect(transform(current, next)).toBe(next);
    expect(current.sources.a).toEqual({ type: 'geojson', data: 'blob:a' });
    expect(current.sources.b).toEqual({ type: 'geojson', data: loaded });
  });

  it('leaves data that was never given as an address, and sources that are gone', () => {
    const transform = keepLoadedGeoJson();
    transform(undefined, style({ overlay: { type: 'geojson', data: loaded }, a: { type: 'geojson', data: 'blob:a' } }));
    const current = style({ overlay: { type: 'geojson', data: loaded }, a: { type: 'geojson', data: loaded } });
    transform(current, style({ overlay: { type: 'geojson', data: loaded } }));
    expect(current.sources.overlay).toEqual({ type: 'geojson', data: loaded });
    expect(current.sources.a).toEqual({ type: 'geojson', data: loaded });
  });
});
