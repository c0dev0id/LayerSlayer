import { describe, expect, it } from 'vitest';
import type { FeatureSource } from '../model/layer';
import { featureQueryUrl, featureTileUrl, parseFeatureTileUrl, readFeatureAnswer } from './featureTiles';
import { getParam } from './urls';

const arcgis: FeatureSource = { type: 'arcgis-features', url: 'https://a.example/FeatureServer/0', geometry: 'point', maxRecordCount: 2000 };
const wfs: FeatureSource = {
  type: 'wfs',
  url: 'https://w.example/wfs?map=x',
  version: '2.0.0',
  typeName: 'ns:roads',
  outputFormat: 'application/json; subtype=geojson',
  maxFeatures: 1000,
};
const ogc: FeatureSource = { type: 'ogc-features', url: 'https://o.example/collections/lakes/items?f=json', limit: 500 };

describe('feature tile URLs', () => {
  it('carry the source to each tile', () => {
    for (const source of [arcgis, wfs, ogc]) {
      const url = featureTileUrl(source).replace('{z}', '3').replace('{x}', '4').replace('{y}', '5');
      expect(parseFeatureTileUrl(url)).toEqual({ z: 3, x: 4, y: 5, source });
    }
  });

  it('leave no braces for the map to fill in but the tile coordinates', () => {
    expect(featureTileUrl(wfs).match(/\{[a-z]+\}/g)).toEqual(['{z}', '{x}', '{y}']);
  });
});

describe('featureQueryUrl', () => {
  it('asks an ArcGIS layer for the features in the tile extent as GeoJSON', () => {
    const url = featureQueryUrl({ z: 1, x: 1, y: 0, source: arcgis });
    expect(url.startsWith('https://a.example/FeatureServer/0/query?')).toBe(true);
    expect(getParam(url, 'geometry')).toBe('0,0,20037508.34,20037508.34');
    expect(getParam(url, 'inSR')).toBe('3857');
    expect(getParam(url, 'outSR')).toBe('4326');
    expect(getParam(url, 'f')).toBe('geojson');
    expect(getParam(url, 'resultRecordCount')).toBe('2000');
    expect(getParam(url, 'resultType')).toBeUndefined();
  });

  it('asks an ArcGIS layer with a tile query where it supports them', () => {
    const url = featureQueryUrl({ z: 9, x: 1, y: 2, source: { ...arcgis, maxRecordCount: 4000, tileQueries: true } });
    expect(getParam(url, 'resultType')).toBe('tile');
    expect(getParam(url, 'resultRecordCount')).toBe('4000');
  });

  it('asks a WFS for GeoJSON in degrees, with the box latitude first', () => {
    const url = featureQueryUrl({ z: 1, x: 1, y: 0, source: wfs });
    expect(url.startsWith('https://w.example/wfs?map=x&')).toBe(true);
    expect(getParam(url, 'REQUEST')).toBe('GetFeature');
    expect(getParam(url, 'TYPENAMES')).toBe('ns:roads');
    expect(getParam(url, 'COUNT')).toBe('1000');
    expect(getParam(url, 'OUTPUTFORMAT')).toBe('application/json; subtype=geojson');
    expect(getParam(url, 'SRSNAME')).toBe('EPSG:4326');
    expect(getParam(url, 'BBOX')).toBe('0,0,85.051129,180,urn:ogc:def:crs:EPSG::4326');
  });

  it('names type and count the WFS 1.1 way', () => {
    const url = featureQueryUrl({ z: 1, x: 1, y: 0, source: { ...wfs, version: '1.1.0' } });
    expect(getParam(url, 'TYPENAME')).toBe('ns:roads');
    expect(getParam(url, 'MAXFEATURES')).toBe('1000');
    expect(getParam(url, 'TYPENAMES')).toBeUndefined();
  });

  it('asks an OGC API collection with a longitude-first bbox', () => {
    const url = featureQueryUrl({ z: 1, x: 0, y: 1, source: ogc });
    expect(getParam(url, 'f')).toBe('json');
    expect(getParam(url, 'bbox')).toBe('-180,-85.051129,0,0');
    expect(getParam(url, 'limit')).toBe('500');
  });
});

describe('readFeatureAnswer', () => {
  const collection = (extra: object = {}) => JSON.stringify({ type: 'FeatureCollection', features: [], ...extra });

  it('reads a feature collection and tells whether more features matched', () => {
    expect(readFeatureAnswer(collection()).truncated).toBe(false);
    expect(readFeatureAnswer(collection({ exceededTransferLimit: true })).truncated).toBe(true);
    expect(readFeatureAnswer(collection({ properties: { exceededTransferLimit: true } })).truncated).toBe(true);
    expect(readFeatureAnswer(collection({ numberMatched: 216, numberReturned: 0 })).truncated).toBe(true);
    expect(readFeatureAnswer(collection({ numberMatched: 'unknown', numberReturned: 0 })).truncated).toBe(false);
  });

  it("throws the server's own message", () => {
    expect(() => readFeatureAnswer('{"error":{"code":400,"message":"Invalid query"}}')).toThrow('Invalid query');
    expect(() => readFeatureAnswer('{"code":"InvalidParameterValue","description":"Bad bbox"}')).toThrow('Bad bbox');
    const report =
      '<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1"><ows:Exception exceptionCode="InvalidParameterValue">' +
      '<ows:ExceptionText>Feature type ns:x unknown</ows:ExceptionText></ows:Exception></ows:ExceptionReport>';
    expect(() => readFeatureAnswer(report)).toThrow('Feature type ns:x unknown');
    expect(() => readFeatureAnswer('<html>Bad Gateway</html>')).toThrow('did not answer with GeoJSON');
  });
});
