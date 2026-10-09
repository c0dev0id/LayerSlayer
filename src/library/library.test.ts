import { describe, expect, it } from 'vitest';
import { detectServiceType } from '../services/detect';
import { IMPORT_ACCEPT } from '../services/importFile';
import { SERVICE_TYPES } from '../services/types';
import topplus from '../services/fixtures/wmts-topplus.xml?raw';
import { parseWmts } from '../services/wmts';
import { parseXyz } from '../services/xyz';
import { originOf } from '../ui/offers';
import { defaultState } from '../state/store';
import library from './library.json';
import { validBounds } from '../geo/mercator';
import { downloadedLayer, entryAreas, entryService, filterLibrary, withEntry, type FileEntry, type LibraryEntry, type ServiceEntry } from './library';
import { REGION_BOUNDS } from './regions';

const entries = library.entries as LibraryEntry[];
const service = (name: string) => entries.find((e): e is ServiceEntry => e.name === name && e.type !== 'file')!;

describe('library', () => {
  it('has complete entries of known types with unique addresses', () => {
    const types = new Set<string>([...SERVICE_TYPES.map((t) => t.value), 'file']);
    for (const entry of entries) {
      expect(entry.name, entry.url).toBeTruthy();
      expect(entry.region, entry.name).toBeTruthy();
      expect(entry.category, entry.name).toBeTruthy();
      expect(types.has(entry.type), entry.name).toBe(true);
      expect(() => new URL(entry.url.replace(/[{}]/g, ''))).not.toThrow();
    }
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
  });

  it('names types the address detection agrees with, and files the import reads', () => {
    for (const entry of entries) {
      if (entry.type === 'file') expect(IMPORT_ACCEPT.split(','), entry.name).toContain(/\.[a-z]+$/.exec(entry.url)?.[0]);
      else expect(detectServiceType(entry.url), entry.name).toBe(entry.type);
    }
  });

  it('holds the default layer as its entry adds it, so the entry shows it as on the map', () => {
    const layer = defaultState().layers[0]!;
    const entry = service(layer.name);
    const offer = withEntry(parseWmts(topplus, entry.url), entry).offers.find((o) => originOf(entry.url, o) === layer.origin);
    const { name, source, bounds, attribution } = offer!.draft!;
    expect({ name: layer.name, source: layer.source, bounds: layer.bounds, attribution: layer.attribution }).toEqual({ name, source, bounds, attribution });
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
    const entry = service('Open Infrastructure Map — water');
    const info = withEntry(entryService(entry)!, entry);
    const drafts = info.offers.filter((o) => o.draft).map((o) => o.draft!);
    expect(drafts.map((d) => d.name)).toEqual(entry.layers);
    expect(drafts[0]).toMatchObject({
      source: { type: 'vector-tiles', tiles: ['https://openinframap.org/map/water/{z}/{x}/{y}.pbf'], layer: 'water_pipeline', minzoom: 3, maxzoom: 17 },
      attribution: entry.attribution,
    });
    expect(entryService(service('OpenTopoMap'))).toBeUndefined();
  });

  it('filters by words, region and category', () => {
    const found = filterLibrary(entries, 'hiking', '', '');
    expect(found.map((e) => e.name)).toContain('Waymarked Trails — hiking routes');
    expect(filterLibrary(entries, '', 'Germany', 'Aerial').every((e) => e.region === 'Germany' && e.category === 'Aerial')).toBe(true);
  });

  it('draws feature layers with their own symbols where the entry says so', () => {
    const entry: ServiceEntry = { name: 'AQI forecast', type: 'arcgis-features', url: 'https://x.example/FeatureServer', region: 'United States', category: 'Weather', ownStyle: true };
    const source = { type: 'arcgis-features' as const, url: `${entry.url}/0`, geometry: 'polygon' as const, maxRecordCount: 2000 };
    const info = withEntry({ title: 'Forecast', offers: [{ title: 'Today', depth: 0, draft: { name: 'Today', source } }] }, entry);
    expect(info.offers[0]!.draft).toMatchObject({ ownStyle: true });
    const plain = withEntry({ title: 'Forecast', offers: [{ title: 'Today', depth: 0, draft: { name: 'Today', source } }] }, { ...entry, ownStyle: undefined });
    expect(plain.offers[0]!.draft).not.toHaveProperty('ownStyle');
  });

  it('adds what the entry knows to a tile template', () => {
    const entry = service('OpenTopoMap');
    const info = withEntry(parseXyz(entry.url), entry);
    expect(info.title).toBe('OpenTopoMap');
    expect(info.offers[0]!.draft).toMatchObject({ name: 'OpenTopoMap', source: { maxzoom: 17 }, attribution: expect.stringContaining('OpenTopoMap') });
  });

  it('names the layer of a downloaded file after its entry, with the file address as its origin', () => {
    const entry = entries.find((e): e is FileEntry => e.type === 'file')!;
    const draft = downloadedLayer(
      { name: 'Streckensperrungen_Motorrad', source: { type: 'geojson', data: { file: 'key', name: 'Streckensperrungen_Motorrad.kmz' } }, bounds: [4, 46, 14, 53] },
      entry,
    );
    expect(draft).toEqual({
      name: entry.name,
      source: { type: 'geojson', data: { file: 'key', name: 'Streckensperrungen_Motorrad.kmz' } },
      bounds: [4, 46, 14, 53],
      origin: entry.url,
      attribution: entry.attribution,
    });
  });
});
