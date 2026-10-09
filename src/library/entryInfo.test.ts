import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import wms130 from '../services/fixtures/wms130-terrestris.xml?raw';
import { parseWms } from '../services/wms';
import { dataLabel, entryFacts, imageFormat, serviceFacts, sourceFacts, styleFacts } from './entryInfo';

describe('imageFormat', () => {
  it('reads the format a tile address names', () => {
    expect(imageFormat('https://tile.example/{z}/{x}/{y}.png')).toBe('PNG');
    expect(imageFormat('https://tile.example/{z}/{x}/{y}.jpg?key=1')).toBe('JPEG');
    expect(imageFormat('https://wmts.example/?SERVICE=WMTS&FORMAT=image%2Fjpeg&TILEMATRIX={TileMatrix}')).toBe('JPEG');
    expect(imageFormat('https://tile.example/{z}/{x}/{y}')).toBeUndefined();
  });
});

describe('sourceFacts', () => {
  it('says what each kind of source is and how it is fetched', () => {
    expect(sourceFacts({ type: 'xyz', tiles: ['https://t/{z}/{x}/{y}.webp'], scheme: 'xyz', tileSize: 256 })).toEqual({
      data: ['raster'],
      format: 'WebP tiles, 256 px',
    });
    expect(sourceFacts({ type: 'xyz', tiles: ['pmtiles://https://a.example/sat.pmtiles/{z}/{x}/{y}'], scheme: 'xyz', tileSize: 512 }).format).toBe(
      'Image tiles from a PMTiles archive, 512 px',
    );
    expect(sourceFacts({ type: 'vector-tiles', tiles: ['https://t/{z}/{x}/{y}.pbf'], layer: 'roads' })).toEqual({
      data: ['vector'],
      format: 'Mapbox Vector Tiles (MVT)',
    });
    expect(
      sourceFacts({ type: 'wfs', url: 'https://w', version: '2.0.0', typeName: 'a', outputFormat: 'application/json', maxFeatures: 2000 }),
    ).toEqual({ data: ['vector'], format: 'GeoJSON (application/json) by GetFeature per tile, made into vector tiles in the browser', version: '2.0.0' });
  });
});

describe('styleFacts', () => {
  it('reads what a style draws from its sources', () => {
    const style = {
      version: 8,
      sources: { a: { type: 'vector', url: 'https://t.json' }, b: { type: 'raster-dem', url: 'https://d.json' }, c: { type: 'vector', url: 'https://u.json' } },
      layers: [],
    } as StyleSpecification;
    expect(styleFacts(style)).toEqual({ data: ['vector', 'raster'], format: 'MapLibre style with vector tiles (MVT), elevation tiles' });
  });
});

describe('serviceFacts', () => {
  it("sums up a service's layers: their kinds, distinct formats, version and number", () => {
    const facts = serviceFacts(parseWms(wms130, 'https://ows.terrestris.de/osm/service?SERVICE=WMS&REQUEST=GetCapabilities'));
    expect(facts.data).toEqual(['raster']);
    expect(facts.formats).toEqual(['image/png by GetMap, 512 px per tile']);
    expect(facts.version).toBe('1.3.0');
    expect(facts.layers).toBeGreaterThan(1);
  });

  it('names data of both kinds', () => {
    expect(dataLabel(['raster'])).toBe('Raster');
    expect(dataLabel(['raster', 'vector'])).toBe('Raster and vector');
  });
});

describe('entryFacts', () => {
  it('has none for a file, and reads a service for the rest', async () => {
    const file = { name: 'Closures', type: 'file', url: 'https://f.example/c.kmz', region: 'Germany', category: 'Traffic' } as const;
    expect(await entryFacts(file, () => Promise.reject(new Error('read')))).toBeUndefined();
    const wms = { name: 'OSM', type: 'wms', url: 'https://ows.terrestris.de/osm/service', region: 'Global', category: 'Basemap' } as const;
    const facts = await entryFacts(wms, () => Promise.resolve(parseWms(wms130, wms.url)));
    expect(facts?.formats).toEqual(['image/png by GetMap, 512 px per tile']);
  });
});
