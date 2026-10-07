import { describe, expect, it } from 'vitest';
import { xyzSource } from './xyz';

describe('xyzSource', () => {
  it('keeps a plain template', () => {
    expect(xyzSource('https://tile.example/{z}/{x}/{y}.png')).toEqual({
      type: 'xyz',
      tiles: ['https://tile.example/{z}/{x}/{y}.png'],
      scheme: 'xyz',
      tileSize: 256,
    });
  });

  it('expands subdomains and ranges', () => {
    expect(xyzSource('https://{s}.t.example/{z}/{x}/{y}.png').tiles).toEqual([
      'https://a.t.example/{z}/{x}/{y}.png',
      'https://b.t.example/{z}/{x}/{y}.png',
      'https://c.t.example/{z}/{x}/{y}.png',
    ]);
    expect(xyzSource('https://t{1-3}.example/{z}/{x}/{y}').tiles).toEqual([
      'https://t1.example/{z}/{x}/{y}',
      'https://t2.example/{z}/{x}/{y}',
      'https://t3.example/{z}/{x}/{y}',
    ]);
  });

  it('turns {-y} into the TMS scheme and other spellings into MapLibre tokens', () => {
    expect(xyzSource('https://t.example/{z}/{x}/{-y}.png')).toMatchObject({ scheme: 'tms', tiles: ['https://t.example/{z}/{x}/{y}.png'] });
    expect(xyzSource('https://t.example/{q}{r}.png').tiles).toEqual(['https://t.example/{quadkey}{ratio}.png']);
  });

  it('rejects addresses without tile placeholders', () => {
    expect(() => xyzSource('https://t.example/map.png')).toThrow(/needs \{z\}/);
  });
});
