import { describe, expect, it } from 'vitest';
import { parsePlaces, searchUrl } from './nominatim';

describe('searchUrl', () => {
  it('asks for a few places as JSON, preferring the view', () => {
    expect(searchUrl(' Schloss Karlsruhe ', [8.3, 48.95, 8.5, 49.05])).toBe(
      'https://nominatim.openstreetmap.org/search?q=Schloss%20Karlsruhe&format=jsonv2&limit=5&viewbox=8.3,48.95,8.5,49.05',
    );
    expect(searchUrl('Paris')).not.toContain('viewbox');
  });
});

describe('parsePlaces', () => {
  it('reads positions, labels and extents', () => {
    const places = parsePlaces([
      { display_name: 'Schloss Karlsruhe, Karlsruhe, Deutschland', lat: '49.0135248', lon: '8.4043592', boundingbox: ['49.0130412', '49.0140237', '8.4032308', '8.4054431'] },
      { display_name: 'Somewhere', lat: '47', lon: '11' },
      { display_name: 'Broken', lat: 'x', lon: '11' },
    ]);
    expect(places).toEqual([
      { label: 'Schloss Karlsruhe, Karlsruhe, Deutschland', lngLat: [8.4043592, 49.0135248], bounds: [8.4032308, 49.0130412, 8.4054431, 49.0140237] },
      { label: 'Somewhere', lngLat: [11, 47] },
    ]);
  });

  it('turns away an answer that is no list', () => {
    expect(() => parsePlaces({ error: 'x' })).toThrow('The search did not answer with a list of places.');
  });
});
