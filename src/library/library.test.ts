import { describe, expect, it } from 'vitest';
import { detectServiceType } from '../services/detect';
import { SERVICE_TYPES } from '../services/types';
import { parseXyz } from '../services/xyz';
import { defaultState } from '../state/store';
import library from './library.json';
import { filterLibrary, withEntry, type LibraryEntry } from './library';

const entries = library.entries as LibraryEntry[];

describe('library', () => {
  it('has complete entries of known types with unique addresses', () => {
    const types = new Set(SERVICE_TYPES.map((t) => t.value));
    for (const entry of entries) {
      expect(entry.name, entry.url).toBeTruthy();
      expect(entry.region, entry.name).toBeTruthy();
      expect(entry.category, entry.name).toBeTruthy();
      expect(types.has(entry.type), entry.name).toBe(true);
      expect(() => new URL(entry.url.replace(/[{}]/g, ''))).not.toThrow();
    }
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
  });

  it('names types the address detection agrees with', () => {
    for (const entry of entries) expect(detectServiceType(entry.url), entry.name).toBe(entry.type);
  });

  it('holds the default layer, so its entry shows it as on the map', () => {
    expect(entries.map((e) => e.url)).toContain(defaultState().layers[0]!.origin);
  });

  it('filters by words, region and category', () => {
    const found = filterLibrary(entries, 'hiking', '', '');
    expect(found.map((e) => e.name)).toContain('Waymarked Trails — hiking routes');
    expect(filterLibrary(entries, '', 'Germany', 'Aerial').every((e) => e.region === 'Germany' && e.category === 'Aerial')).toBe(true);
  });

  it('adds what the entry knows to a tile template', () => {
    const entry = entries.find((e) => e.name === 'OpenTopoMap')!;
    const info = withEntry(parseXyz(entry.url), entry);
    expect(info.title).toBe('OpenTopoMap');
    expect(info.offers[0]!.draft).toMatchObject({ name: 'OpenTopoMap', source: { maxzoom: 17 }, attribution: expect.stringContaining('OpenTopoMap') });
  });
});
