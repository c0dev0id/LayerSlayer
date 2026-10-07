import { describe, expect, it } from 'vitest';
import { getParam, resolveUrl, withParams } from './urls';

describe('withParams', () => {
  it('replaces GetCapabilities parameters regardless of case and keeps the rest', () => {
    const url = withParams('https://a.example/wms?service=WMS&request=GetCapabilities&map=/x.map', {
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
    });
    expect(url).toBe('https://a.example/wms?map=/x.map&SERVICE=WMS&REQUEST=GetMap');
  });

  it('keeps map placeholders and readable separators', () => {
    const url = withParams('https://a.example/wms', { BBOX: '{bbox-epsg-3857}', LAYERS: 'a b,c', CRS: 'EPSG:3857' });
    expect(url).toBe('https://a.example/wms?BBOX={bbox-epsg-3857}&LAYERS=a%20b,c&CRS=EPSG:3857');
  });

  it('copes with a trailing question mark and drops the fragment', () => {
    expect(withParams('https://a.example/wms?#x', { A: 1 })).toBe('https://a.example/wms?A=1');
  });
});

describe('getParam', () => {
  it('finds a parameter ignoring case', () => {
    expect(getParam('https://a.example/?Service=WMTS&x=1', 'SERVICE')).toBe('WMTS');
    expect(getParam('https://a.example/', 'SERVICE')).toBeUndefined();
  });
});

describe('resolveUrl', () => {
  it('resolves relative URLs and keeps placeholders', () => {
    expect(resolveUrl('fonts/{fontstack}/{range}.pbf', 'https://a.example/styles/s.json')).toBe(
      'https://a.example/styles/fonts/{fontstack}/{range}.pbf',
    );
    expect(resolveUrl('/t/{z}/{x}/{y}', 'https://a.example/styles/s.json')).toBe('https://a.example/t/{z}/{x}/{y}');
  });

  it('leaves absolute URLs alone', () => {
    expect(resolveUrl('https://b.example/{z}', 'https://a.example/')).toBe('https://b.example/{z}');
    expect(resolveUrl('pmtiles://x', 'https://a.example/')).toBe('pmtiles://x');
  });
});
