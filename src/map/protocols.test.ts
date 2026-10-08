import { describe, expect, it } from 'vitest';
import { wmtsTileUrl } from './compose';
import { featureQueryUrl, featureTileUrl, parseFeatureTileUrl } from './featureTiles';
import { cacheKey } from './protocols';

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
