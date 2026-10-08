import { geoJSONToTile } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { describe, expect, it } from 'vitest';
import { tileLayerNames } from './mvt';
import { parseTemplate, parseTileJson, TEMPLATE_MAXZOOM } from './vectorTiles';

const tileJson = {
  name: 'Versatiles',
  attribution: '© OpenStreetMap contributors',
  tiles: ['/tiles/osm/{z}/{x}/{y}'],
  minzoom: 0,
  maxzoom: 14,
  bounds: [-180, -90, 180, 90],
  vector_layers: [
    { id: 'ocean', minzoom: 0, maxzoom: 14 },
    { id: 'buildings', description: 'Building outlines', minzoom: 14, maxzoom: 14 },
  ],
};

describe('parseTileJson', () => {
  it('offers each tile layer under a heading, with its tiles resolved and its own minimum zoom', () => {
    const info = parseTileJson(tileJson, 'https://tiles.versatiles.org/tiles/osm/tiles.json');
    expect(info.offers.map((o) => [o.title, o.depth, !!o.draft])).toEqual([
      ['Versatiles', 0, false],
      ['ocean', 1, true],
      ['buildings', 1, true],
    ]);
    expect(info.offers[2]!.draft).toEqual({
      name: 'buildings',
      source: {
        type: 'vector-tiles',
        tiles: ['https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}'],
        minzoom: 0,
        maxzoom: 14,
        layer: 'buildings',
      },
      bounds: [-180, -85.0511287798, 180, 85.0511287798],
      attribution: '© OpenStreetMap contributors',
      minzoom: 14,
    });
    expect(info.offers[1]!.draft).not.toHaveProperty('minzoom');
    expect(info.offers[2]!.description).toBe('Building outlines');
  });

  it('names a single tile layer after the tile set, without a heading', () => {
    const info = parseTileJson({ ...tileJson, vector_layers: [{ id: 'ocean' }] }, 'https://t/tiles.json');
    expect(info.offers).toHaveLength(1);
    expect(info.offers[0]!.draft!.name).toBe('Versatiles');
  });

  it('turns away raster TileJSON and other documents', () => {
    expect(() => parseTileJson({ tiles: ['https://t/{z}/{x}/{y}.png'] }, 'https://t/tiles.json')).toThrow('lists no vector layers');
    expect(() => parseTileJson({}, 'https://t/tiles.json')).toThrow('lists no tiles');
  });
});

describe('parseTemplate', () => {
  it('offers the layers read from a tile, up to the usual highest zoom', () => {
    const info = parseTemplate('https://{a-c}.t.example/{z}/{x}/{-y}.pbf', ['roads', 'water'], 't.example');
    expect(info.offers[1]!.draft!.source).toEqual({
      type: 'vector-tiles',
      tiles: ['https://a.t.example/{z}/{x}/{y}.pbf', 'https://b.t.example/{z}/{x}/{y}.pbf', 'https://c.t.example/{z}/{x}/{y}.pbf'],
      scheme: 'tms',
      maxzoom: TEMPLATE_MAXZOOM,
      layer: 'roads',
    });
    expect(() => parseTemplate('https://t/{z}/{x}/{y}.pbf', [], 't')).toThrow('holds no layers');
  });
});

describe('tileLayerNames', () => {
  it('lists the layers of a vector tile', () => {
    const point = (name: string) =>
      geoJSONToTile(
        {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: [1, 1] } }],
        },
        0,
        0,
        0,
      )!;
    const bytes = fromGeojsonVt({ roads: point('a'), water: point('b') }, { version: 2, extent: 4096 });
    expect(tileLayerNames(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).toEqual([
      'roads',
      'water',
    ]);
  });
});
