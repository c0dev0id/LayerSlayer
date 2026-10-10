import { afterEach, describe, expect, it, vi } from 'vitest';
import { wmtsTileUrl } from './compose';
import { featureQueryUrl, featureTileUrl, parseFeatureTileUrl } from './featureTiles';
import { cacheKey, loadTile } from './protocols';

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

describe('tile errors', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: string, type: string) => vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-type': type } }));
  const load = (url: string) => loadTile({ url, type: 'arrayBuffer' }, new AbortController());

  it('reports the text of an exception report sent instead of a tile', async () => {
    answer(
      '<ServiceExceptionReport version="1.3.0"><ServiceException code="LayerNotDefined">\n Could not find layer Satellit\n</ServiceException></ServiceExceptionReport>',
      'text/xml;charset=UTF-8',
    );
    await expect(load('https://maps.example/ows?REQUEST=GetMap&LAYERS=Satellit')).rejects.toThrow(
      'maps.example answered with an error: Could not find layer Satellit',
    );
  });

  it('reports an image tile that is no whole image, as from a proxy cutting it off', async () => {
    const image = (url: string) => loadTile({ url, type: 'image' }, new AbortController());
    answer('Upstream fetch failed: timeout', 'text/plain');
    await expect(image('https://maps.example/ows?REQUEST=GetMap')).rejects.toThrow('maps.example answered with text instead of an image (“Upstream fetch failed: timeout”) instead of a tile.');
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), { headers: { 'content-type': 'image/png' } }));
    await expect(image('https://maps.example/ows?REQUEST=GetMap')).rejects.toThrow('maps.example answered with a PNG image that is cut off instead of a tile.');
  });

  it('passes images through, SVG included', async () => {
    answer('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
    expect((await load('https://maps.example/tile.svg')).data).toBeInstanceOf(ArrayBuffer);
  });
});
