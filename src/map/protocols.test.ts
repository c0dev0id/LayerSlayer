import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { describe, expect, it } from 'vitest';
import { getParam } from './urls';
import { featureTileUrl, wmtsTileUrl } from './compose';
import { cacheKey, encodeFeatures, featureQueryUrl } from './protocols';

describe('featureQueryUrl', () => {
  it('asks for the features in the tile extent as GeoJSON', () => {
    const url = featureQueryUrl('https://a.example/FeatureServer/0', 1, 1, 0, 2000);
    expect(url.startsWith('https://a.example/FeatureServer/0/query?')).toBe(true);
    expect(getParam(url, 'geometry')).toBe('0,0,20037508.34,20037508.34');
    expect(getParam(url, 'inSR')).toBe('3857');
    expect(getParam(url, 'outSR')).toBe('4326');
    expect(getParam(url, 'f')).toBe('geojson');
    expect(getParam(url, 'resultRecordCount')).toBe('2000');
  });
});

describe('cacheKey', () => {
  const tile = (template: string) => template.replace('{z}', '9').replace('{x}', '2').replace('{y}', '3');

  it('keeps tiles under the address that answers them', () => {
    expect(cacheKey('https://t.example/9/2/3.png')).toBe('https://t.example/9/2/3.png');
    const wmts = wmtsTileUrl({ type: 'wmts', template: 'https://w/{TileMatrix}/{TileRow}/{TileCol}.png', matrices: { '9': '09', '10': '10' }, tileSize: 256 });
    expect(cacheKey(tile(wmts))).toBe('https://w/09/3/2.png');
    expect(cacheKey(tile(featureTileUrl('https://a/FeatureServer/0', 2000)))).toBe(featureQueryUrl('https://a/FeatureServer/0', 9, 2, 3, 2000));
  });
});

describe('encodeFeatures', () => {
  it('encodes features as a vector tile layer', () => {
    const data = encodeFeatures(
      {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'a' }, geometry: { type: 'Point', coordinates: [10, 10] } },
          {
            type: 'Feature',
            properties: { name: 'b' },
            geometry: { type: 'Polygon', coordinates: [[[-170, -80], [170, -80], [170, 80], [-170, 80], [-170, -80]]] },
          },
        ],
      },
      0,
      0,
      0,
    );
    const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers.features!;
    expect(layer.length).toBe(2);
    expect(layer.feature(0).properties.name).toBe('a');
    expect(layer.feature(1).type).toBe(3);
  });

  it('gives an empty tile for no features', () => {
    expect(encodeFeatures({ type: 'FeatureCollection', features: [] }, 3, 1, 1).byteLength).toBe(0);
  });
});
