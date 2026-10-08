import { describe, expect, it } from 'vitest';
import { detectServiceType } from '../services/detect';
import { SERVICE_TYPES } from '../services/types';
import { parseXyz } from '../services/xyz';
import { defaultState } from '../state/store';
import library from './library.json';
import { validBounds } from '../geo/mercator';
import { entryAreas, entryService, filterLibrary, withEntry, type LibraryEntry } from './library';
import { REGION_BOUNDS } from './regions';

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

  it('knows the area of every region but Global, in valid bounds', () => {
    for (const region of new Set(entries.map((e) => e.region))) {
      if (region === 'Global') expect(REGION_BOUNDS[region]).toBeUndefined();
      else expect(REGION_BOUNDS[region], region).toBeDefined();
    }
    for (const [region, areas] of Object.entries(REGION_BOUNDS)) {
      for (const area of areas) expect(validBounds(...area), region).toEqual(area);
    }
  });

  it('takes the bounds of an entry over those of its region', () => {
    const swiss = entries.find((e) => e.bounds)!;
    expect(entryAreas(swiss)).toEqual([swiss.bounds]);
    expect(entryAreas({ ...swiss, bounds: undefined })).toBe(REGION_BOUNDS[swiss.region]);
    expect(entryAreas({ ...swiss, bounds: undefined, region: 'Global' })).toEqual([]);
  });

  it('offers the tile layers a vector tile template lists, within its zooms', () => {
    const entry = entries.find((e) => e.name === 'Open Infrastructure Map — water')!;
    const info = withEntry(entryService(entry)!, entry);
    const drafts = info.offers.filter((o) => o.draft).map((o) => o.draft!);
    expect(drafts.map((d) => d.name)).toEqual(entry.layers);
    expect(drafts[0]).toMatchObject({
      source: { type: 'vector-tiles', tiles: ['https://openinframap.org/map/water/{z}/{x}/{y}.pbf'], layer: 'water_pipeline', minzoom: 3, maxzoom: 17 },
      attribution: entry.attribution,
    });
    expect(entryService(entries.find((e) => e.name === 'OpenTopoMap')!)).toBeUndefined();
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
