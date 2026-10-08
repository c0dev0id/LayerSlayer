import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { describe, expect, it } from 'vitest';
import { wmtsTileUrl } from './compose';
import { featureQueryUrl, featureTileUrl, parseFeatureTileUrl } from './featureTiles';
import { cacheKey, encodeFeatures } from './protocols';

describe('cacheKey', () => {
  const tile = (template: string) => template.replace('{z}', '9').replace('{x}', '2').replace('{y}', '3');

  it('keeps tiles under the address that answers them', () => {
    expect(cacheKey('https://t.example/9/2/3.png')).toBe('https://t.example/9/2/3.png');
    const wmts = wmtsTileUrl({ type: 'wmts', template: 'https://w/{TileMatrix}/{TileRow}/{TileCol}.png', matrices: { '9': '09', '10': '10' }, tileSize: 256 });
    expect(cacheKey(tile(wmts))).toBe('https://w/09/3/2.png');
    const features = tile(featureTileUrl({ type: 'arcgis-features', url: 'https://a/FeatureServer/0', geometry: 'point', maxRecordCount: 4000 }));
    expect(cacheKey(features)).toBe(featureQueryUrl(parseFeatureTileUrl(features)));
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
