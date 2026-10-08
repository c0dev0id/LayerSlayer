import { describe, expect, it } from 'vitest';
import geoserver from './fixtures/wfs200-geoserver.xml?raw';
import mapserver from './fixtures/wfs200-mapserver.xml?raw';
import { FEATURE_MINZOOM } from './types';
import { geojsonFormat, parseWfs, WFS_MAX_FEATURES } from './wfs';

describe('parseWfs', () => {
  it('offers each feature type of a GeoServer as a GeoJSON feature layer', () => {
    const info = parseWfs(geoserver, 'https://api.mobidata-bw.de/geoserver/ows?SERVICE=WFS&REQUEST=GetCapabilities');
    expect(info.offers.map((o) => o.name)).toEqual(['MobiData-BW:roadworks', 'MobiData-BW:charge_points']);
    const roadworks = info.offers[0]!;
    expect(roadworks.title).toBe('Arbeitsstellen');
    expect(roadworks.draft).toEqual({
      name: 'Arbeitsstellen',
      source: {
        type: 'wfs',
        url: 'https://api.mobidata-bw.de/geoserver/wfs',
        version: '2.0.0',
        typeName: 'MobiData-BW:roadworks',
        outputFormat: 'application/json',
        maxFeatures: WFS_MAX_FEATURES,
      },
      minzoom: FEATURE_MINZOOM,
      bounds: [7.6, 47.5, 10.2, 49.5],
      attribution: 'MobiData BW',
    });
    expect(info.offers[1]!.description).toBe('Ladestandorte zum Laden von Elektrofahrzeugen');
  });

  it("uses a MapServer's GetFeature address and its name for GeoJSON", () => {
    const info = parseWfs(mapserver, 'https://services.sandre.eaufrance.fr/geo/sandre?SERVICE=WFS&REQUEST=GetCapabilities');
    expect(info.title).toBe('Référentiels géographiques du Sandre');
    const source = info.offers[0]!.draft!.source;
    expect(source).toMatchObject({
      url: 'https://services.sandre.eaufrance.fr/geo/sandre?language=fre&',
      typeName: 'sa:LieuSurvRsx',
      outputFormat: 'application/json; subtype=geojson',
    });
  });

  it('marks feature types the server cannot send as GeoJSON', () => {
    const gmlOnly = geoserver.replace(/<ows:Value>(application\/json|application\/geo\+json|json)<\/ows:Value>/g, '');
    const offer = parseWfs(gmlOnly, 'https://x/wfs').offers[0]!;
    expect(offer.draft).toBeUndefined();
    expect(offer.reason).toBe('The server cannot answer in GeoJSON.');
  });

  it('keeps to a lower feature limit the server sets', () => {
    const limited = geoserver.replace('<ows:DefaultValue>1000000</ows:DefaultValue>', '<ows:DefaultValue>500</ows:DefaultValue>');
    expect(parseWfs(limited, 'https://x/wfs').offers[0]!.draft!.source).toMatchObject({ maxFeatures: 500 });
  });

  it('turns away other versions and other documents', () => {
    expect(() => parseWfs('<WFS_Capabilities version="1.0.0"/>', 'https://x/wfs')).toThrow('WFS 1.0.0');
    expect(() => parseWfs('<WMS_Capabilities version="1.3.0"/>', 'https://x/wfs')).toThrow('not answer with WFS capabilities');
  });
});

describe('geojsonFormat', () => {
  it("prefers plain GeoJSON in the server's own spelling", () => {
    expect(geojsonFormat(['GML2', 'application/vnd.ogc.fg+json', 'application/geo+json', 'application/json'])).toBe('application/json');
    expect(geojsonFormat(['text/xml; subtype=gml/3.2.1', 'application/json;  subtype=geojson'])).toBe('application/json;  subtype=geojson');
    expect(geojsonFormat(['text/javascript', 'GML3'])).toBeUndefined();
  });
});
