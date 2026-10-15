import { describe, expect, it } from 'vitest';
import type { WmtsSource } from '../model/layer';
import { isPlainTileUrl, plainTileUrl } from './plainTiles';

const wmts = (matrices: Record<string, string>, template = 'https://w.example/tile/{TileMatrix}/{TileRow}/{TileCol}.png'): WmtsSource => ({ type: 'wmts', template, matrices, tileSize: 256 });

describe('isPlainTileUrl', () => {
  it('takes http(s) addresses with only {z}, {x} and {y}', () => {
    expect(isPlainTileUrl('https://t.example/{z}/{x}/{y}.png?key=1')).toBe(true);
    expect(isPlainTileUrl('https://t.example/tile/{z}/{y}/{x}')).toBe(true);
    expect(isPlainTileUrl('https://t.example/{z}/{x}/{y}{ratio}.png')).toBe(false);
    expect(isPlainTileUrl('https://t.example/{quadkey}.png')).toBe(false);
    expect(isPlainTileUrl('pmtiles://https://t.example/a.pmtiles/{z}/{x}/{y}')).toBe(false);
  });
});

describe('plainTileUrl', () => {
  it('gives XYZ templates counted from the top and WMTS named by zoom', () => {
    expect(plainTileUrl({ type: 'xyz', tiles: ['https://a.t.example/{z}/{x}/{y}.png', 'https://b.t.example/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 })).toBe('https://a.t.example/{z}/{x}/{y}.png');
    expect(plainTileUrl({ type: 'xyz', tiles: ['https://t.example/{z}/{x}/{y}.png'], scheme: 'tms', tileSize: 256 })).toBeUndefined();
    expect(plainTileUrl(wmts({ 0: '0', 1: '1' }))).toBe('https://w.example/tile/{z}/{y}/{x}.png');
    expect(plainTileUrl(wmts({ 0: 'EPSG:3857:0', 1: 'EPSG:3857:1' }))).toBe('https://w.example/tile/EPSG:3857:{z}/{y}/{x}.png');
    expect(plainTileUrl(wmts({ 0: '00', 1: '01', 10: '10' }))).toBe('https://w.example/tile/{z}/{y}/{x}.png');
    expect(plainTileUrl(wmts({ 0: 'a', 1: 'b' }))).toBeUndefined();
    expect(plainTileUrl({ type: 'wms', url: 'https://w.example/wms', version: '1.3.0', layers: 'a', styles: '', format: 'image/png', crs: 'EPSG:3857' })).toBeUndefined();
  });
});
