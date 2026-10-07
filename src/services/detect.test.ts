import { describe, expect, it } from 'vitest';
import { detectServiceType } from './detect';

describe('detectServiceType', () => {
  it.each([
    ['https://tile.example/{z}/{x}/{y}.png', 'xyz'],
    ['https://x/arcgis/rest/services/A/MapServer/tile/{z}/{y}/{x}', 'xyz'],
    ['https://x/wmts/1.0.0/WMTSCapabilities.xml', 'wmts'],
    ['https://x/wmts?SERVICE=WMTS&REQUEST=GetCapabilities', 'wmts'],
    ['https://x/service?service=wms&request=GetCapabilities', 'wms'],
    ['https://x/arcgis/services/A/MapServer/WMSServer', 'wms'],
    ['https://x/arcgis/rest/services/A/MapServer?f=json', 'arcgis-mapserver'],
    ['https://x/arcgis/rest/services/A/MapServer/', 'arcgis-mapserver'],
    ['https://x/arcgis/rest/services/A/MapServer/3', 'arcgis-features'],
    ['https://x/arcgis/rest/services/A/FeatureServer', 'arcgis-features'],
    ['https://x/arcgis/rest/services/A/FeatureServer/0?f=json', 'arcgis-features'],
    ['https://x/maps/topo.pdf', 'geopdf'],
    ['https://x/data/quakes.geojson', 'geojson'],
    ['https://tiles.openfreemap.org/styles/liberty', 'style'],
    ['https://x/style.json', 'style'],
  ])('%s is %s', (url, type) => {
    expect(detectServiceType(url)).toBe(type);
  });

  it('gives up on addresses without a telltale', () => {
    expect(detectServiceType('https://x/data.json')).toBeUndefined();
  });
});
