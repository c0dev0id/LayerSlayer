import { describe, expect, it } from 'vitest';
import { createLayer, type Layer } from '../model/layer';
import { isDataProperty, propertyKeys, withLayerStyle } from './featureProperties';

describe('propertyKeys', () => {
  it('lists text and number properties, those most features have first, leaving out styling', () => {
    const features = [
      { properties: { name: 'A', styleUrl: '#s', stroke: '#ff0000', ref: 3 } },
      { properties: { name: 'B', description: 'closed', nested: { a: 1 }, flag: true } },
      { properties: null },
    ];
    expect(propertyKeys(features)).toEqual(['name', 'description', 'ref']);
  });

  it('tells styling from data', () => {
    expect(isDataProperty('icon-scale')).toBe(false);
    expect(isDataProperty('name')).toBe(true);
  });
});

describe('withLayerStyle', () => {
  const layer = (settings: Partial<Layer> = {}): Layer => ({
    ...createLayer({ name: 'Tracks', source: { type: 'geojson', data: { url: 'https://x.example/a.geojson' } } }, []),
    color: '#1c7ed6',
    opacity: 0.8,
    ...settings,
  });
  const feature = (geometry: GeoJSON.Geometry | null, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<GeoJSON.Geometry | null> => ({ type: 'Feature', geometry, properties });
  const point: GeoJSON.Point = { type: 'Point', coordinates: [8, 50] };
  const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[8, 50], [9, 51]] };
  const area: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[8, 50], [9, 50], [9, 51], [8, 50]]] };
  const maki = { id: 'maki:fuel', size: [15, 15] as [number, number], paths: ['M0 0h1z'] };

  it('writes the colour, opacity and widths each kind of feature is drawn with, in place of the styling it brought', () => {
    const kml = { name: 'A', styleUrl: '#s', stroke: '#ff0000', 'icon-color': '#00ff00', 'label-scale': 2 };
    const styled = withLayerStyle({ type: 'FeatureCollection', name: 'export', features: [feature(point, kml), feature(line), feature(area)] } as GeoJSON.FeatureCollection, layer());
    expect(styled).toMatchObject({ type: 'FeatureCollection', name: 'export' });
    expect((styled as GeoJSON.FeatureCollection).features.map((f) => f.properties)).toEqual([
      { name: 'A', 'marker-color': '#1c7ed6', 'marker-size': 'small' },
      { stroke: '#1c7ed6', 'stroke-width': 2.5, 'stroke-opacity': 0.8 },
      { stroke: '#1c7ed6', 'stroke-width': 1.5, 'stroke-opacity': 0.8, fill: '#1c7ed6', 'fill-opacity': 0.2 },
    ]);
  });

  it('marks points with the Maki icon by name, and sizes markers by the icon size', () => {
    const marker = (settings: Partial<Layer>) => (withLayerStyle(point, layer(settings)) as GeoJSON.Feature).properties;
    expect(marker({ icon: maki })).toEqual({ 'marker-color': '#1c7ed6', 'marker-size': 'medium', 'marker-symbol': 'fuel' });
    expect(marker({ icon: { ...maki, id: 'mdi:fuel' }, iconSize: 2 })).toEqual({ 'marker-color': '#1c7ed6', 'marker-size': 'large' });
  });

  it('keeps a single feature a feature, styles every part of a collection of geometries and leaves features without geometry unstyled', () => {
    expect(withLayerStyle(feature(line, { ref: 7 }), layer({ lineWidth: 4 }))).toEqual(feature(line, { ref: 7, stroke: '#1c7ed6', 'stroke-width': 4, 'stroke-opacity': 0.8 }));
    const mixed = withLayerStyle({ type: 'GeometryCollection', geometries: [point, line] }, layer()) as GeoJSON.Feature;
    expect(mixed.properties).toEqual({ 'marker-color': '#1c7ed6', 'marker-size': 'small', stroke: '#1c7ed6', 'stroke-width': 2.5, 'stroke-opacity': 0.8 });
    expect((withLayerStyle(feature(null, { name: 'B' }), layer()) as GeoJSON.Feature).properties).toEqual({ name: 'B' });
  });
});
