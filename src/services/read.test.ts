import { describe, expect, it } from 'vitest';
import { fileName, wmsCapabilitiesUrl } from './read';

describe('wmsCapabilitiesUrl', () => {
  it('asks for version 1.3.0 unless the address names a version', () => {
    expect(wmsCapabilitiesUrl('https://w.example/wms?SERVICE=WMS&REQUEST=GetCapabilities')).toBe(
      'https://w.example/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0',
    );
    expect(wmsCapabilitiesUrl('https://w.example/wms?version=1.1.1')).toBe('https://w.example/wms?version=1.1.1&SERVICE=WMS&REQUEST=GetCapabilities');
  });
});

describe('fileName', () => {
  it('takes the last part of the path without its extension', () => {
    expect(fileName('https://a.example/data/quakes.geojson?x=1')).toBe('quakes');
    expect(fileName('https://a.example/styles/liberty/')).toBe('liberty');
  });
});
