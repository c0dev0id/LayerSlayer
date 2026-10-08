import { describe, expect, it } from 'vitest';
import { FEATURE_MINZOOM, parseFeatureService, parseMapServer } from './arcgis';
import dynamic from './fixtures/arcgis-mapserver-dynamic.json';
import tiled from './fixtures/arcgis-mapserver-tiled.json';
import featureServer from './fixtures/arcgis-featureserver.json';
import featureLayer from './fixtures/arcgis-featurelayer.json';

describe('parseMapServer', () => {
  it('offers a cached Web Mercator service as XYZ tiles', () => {
    const info = parseMapServer(tiled as never, 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=json');
    expect(info.offers).toHaveLength(1);
    expect(info.offers[0]!.draft).toMatchObject({
      source: {
        type: 'xyz',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 23,
      },
    });
  });

  it('offers a dynamic service as a whole and by layer', () => {
    const info = parseMapServer(dynamic as never, 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Wilderness_01/MapServer/');
    expect(info.title).toBe('EDW_Wilderness_01');
    expect(info.offers.map((o) => [o.title, o.depth])).toEqual([
      ['EDW_Wilderness_01 (all layers)', 0],
      ['National Wilderness Areas', 1],
    ]);
    expect(info.offers[1]!.draft).toMatchObject({
      source: { type: 'arcgis-map', url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Wilderness_01/MapServer', format: 'png32', layers: 'show:0' },
      attribution: 'US Forest Service Enterprise Map Service Program',
    });
    expect(info.offers[1]!.draft!.bounds![0]).toBeCloseTo(-139.636, 2);
  });

  it('passes on the server error', () => {
    expect(() => parseMapServer({ error: { message: 'Token Required' } }, 'x')).toThrow(/Token Required/);
  });
});

describe('parseFeatureService', () => {
  it('offers each layer of a FeatureServer', () => {
    const info = parseFeatureService(featureServer as never, 'https://services3.arcgis.com/x/arcgis/rest/services/WFIGS/FeatureServer?f=json');
    expect(info.offers[0]!.draft).toMatchObject({
      name: 'Perimeters',
      source: { type: 'arcgis-features', url: 'https://services3.arcgis.com/x/arcgis/rest/services/WFIGS/FeatureServer/0', geometry: 'polygon', maxRecordCount: 1000 },
      minzoom: FEATURE_MINZOOM,
    });
  });

  it('keeps a higher minimum zoom the service asks for', () => {
    // minScale 70 000 is just under map zoom 12.
    const info = parseFeatureService({ ...featureLayer, minScale: 70000 } as never, 'https://x/FeatureServer/0');
    expect(info.offers[0]!.draft!.minzoom).toBeCloseTo(11.9, 1);
  });

  it('offers a single feature layer with its own record limit', () => {
    const info = parseFeatureService(featureLayer as never, 'https://services3.arcgis.com/x/FeatureServer/0');
    expect(info.offers[0]!.draft).toMatchObject({
      source: { url: 'https://services3.arcgis.com/x/FeatureServer/0', geometry: 'polygon', maxRecordCount: 2000 },
    });
    // The fixture's extent is not in degrees, so no bounds are taken from it.
    expect(info.offers[0]!.draft!.bounds).toBeUndefined();
  });

  it('refuses a layer that cannot answer in GeoJSON', () => {
    const info = parseFeatureService({ ...featureLayer, supportedQueryFormats: 'JSON' } as never, 'https://x/FeatureServer/0');
    expect(info.offers[0]!.reason).toMatch(/GeoJSON/);
  });
});
