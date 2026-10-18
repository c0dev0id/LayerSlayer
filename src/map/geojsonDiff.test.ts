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

  it('shows a diff the same stand-in for the data of an overlay on the map, changing neither style given', () => {
    const transform = keepLoadedGeoJson(['overlay']);
    const world = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [8, 50] } }] } as GeoJSON.FeatureCollection;
    const first = style({ overlay: { type: 'geojson', data: world } });
    // The first style brings the overlay's data with it.
    expect(transform(style({}), first)).toBe(first);

    const current = style({ overlay: { type: 'geojson', data: world } });
    const given = style({ overlay: { type: 'geojson', data: world } });
    const next = transform(current, given);
    expect(next.sources.overlay).toEqual(current.sources.overlay);
    expect(next.sources.overlay).toEqual({ type: 'geojson', data: loaded });
    expect(given.sources.overlay).toEqual({ type: 'geojson', data: world });
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
