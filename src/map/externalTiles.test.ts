import { describe, expect, it } from 'vitest';
import type { WmtsSource } from '../model/layer';
import { externalTileUrl, isExternalTileUrl } from './externalTiles';

const wmts = (matrices: Record<string, string>, template = 'https://w.example/tile/{TileMatrix}/{TileRow}/{TileCol}.png'): WmtsSource => ({ type: 'wmts', template, matrices, tileSize: 256 });

describe('isExternalTileUrl', () => {
  it('takes https addresses with only {z}, {x} and {y}, or only {bbox}', () => {
    expect(isExternalTileUrl('https://t.example/{z}/{x}/{y}.png?key=1')).toBe(true);
    expect(isExternalTileUrl('https://t.example/tile/{z}/{y}/{x}')).toBe(true);
    expect(isExternalTileUrl('http://t.example/{z}/{x}/{y}.png')).toBe(false);
    expect(isExternalTileUrl('https://w.example/wms?BBOX={bbox}&WIDTH=256')).toBe(true);
    expect(isExternalTileUrl('https://w.example/wms?BBOX={bbox-epsg-3857}')).toBe(false);
    expect(isExternalTileUrl('https://t.example/static.png')).toBe(false);
    expect(isExternalTileUrl('https://t.example/{z}/{x}/{y}{ratio}.png')).toBe(false);
    expect(isExternalTileUrl('https://t.example/{quadkey}.png')).toBe(false);
    expect(isExternalTileUrl('pmtiles://https://t.example/a.pmtiles/{z}/{x}/{y}')).toBe(false);
  });
});

describe('externalTileUrl', () => {
  it('gives a WMS GetMap with {bbox} for 256-pixel tiles, over https only', () => {
    const wms = { type: 'wms', url: 'https://w.example/geoserver/ows?', version: '1.3.0', layers: 'ws:roads', styles: '', format: 'image/png', crs: 'EPSG:3857' } as const;
    expect(externalTileUrl(wms)).toBe(
      'https://w.example/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ws:roads&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&BBOX={bbox}&WIDTH=256&HEIGHT=256',
    );
    expect(externalTileUrl({ ...wms, url: 'http://w.example/wms' })).toBeUndefined();
  });

  it('gives raster XYZ templates counted from the top and WMTS named by zoom, not vector tiles', () => {
    expect(externalTileUrl({ type: 'xyz', tiles: ['https://a.t.example/{z}/{x}/{y}.png', 'https://b.t.example/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 })).toBe('https://a.t.example/{z}/{x}/{y}.png');
    expect(externalTileUrl({ type: 'xyz', tiles: ['https://t.example/{z}/{x}/{y}.png'], scheme: 'tms', tileSize: 256 })).toBeUndefined();
    expect(externalTileUrl(wmts({ 0: '0', 1: '1' }))).toBe('https://w.example/tile/{z}/{y}/{x}.png');
    expect(externalTileUrl(wmts({ 0: 'EPSG:3857:0', 1: 'EPSG:3857:1' }))).toBe('https://w.example/tile/EPSG:3857:{z}/{y}/{x}.png');
    expect(externalTileUrl(wmts({ 0: '00', 1: '01', 10: '10' }))).toBe('https://w.example/tile/{z}/{y}/{x}.png');
    expect(externalTileUrl(wmts({ 0: 'a', 1: 'b' }))).toBeUndefined();
    expect(externalTileUrl({ type: 'vector-tiles', tiles: ['https://v.example/{z}/{x}/{y}.pbf'], layer: 'roads' })).toBeUndefined();
  });
});
