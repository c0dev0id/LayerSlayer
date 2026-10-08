import type { Bounds, LayerDraft } from '../model/layer';
import type { ServiceInfo, ServiceType } from '../services/types';
import { parseTemplate } from '../services/vectorTiles';
import { tileTemplates } from '../services/xyz';
import { REGION_BOUNDS } from './regions';

/** A service in the library: where it is, what it covers and what it is for. */
export interface LibraryEntry {
  name: string;
  type: ServiceType;
  url: string;
  region: string;
  category: string;
  note?: string;
  /** False where the server sends no valid CORS header, so a browser needs a proxy to use it. */
  cors?: false;
  /** For a tile template: what the template cannot say itself. */
  attribution?: string;
  bounds?: Bounds;
  /** The zooms the tile set has tiles for. */
  minzoom?: number;
  maxzoom?: number;
  /** The tile layers of a vector tile template, which sample tiles may not all show. */
  layers?: string[];
}

export async function loadLibrary(): Promise<LibraryEntry[]> {
  const { default: library } = await import('./library.json');
  return library.entries as LibraryEntry[];
}

/** Where an entry has data, as far as the library knows: its own bounds or its region's; none for global services. */
export function entryAreas(entry: LibraryEntry): readonly Bounds[] {
  return entry.bounds ? [entry.bounds] : (REGION_BOUNDS[entry.region] ?? []);
}

/** Entries matching a search in name, note, region or category, and the chosen region and category. */
export function filterLibrary(entries: readonly LibraryEntry[], query: string, region: string, category: string): LibraryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(
    (e) =>
      (!region || e.region === region) &&
      (!category || e.category === category) &&
      words.every((w) => `${e.name} ${e.note ?? ''} ${e.region} ${e.category}`.toLowerCase().includes(w)),
  );
}

/** What an entry offers without reading the service: a vector tile template whose tile layers it lists. */
export function entryService(entry: LibraryEntry): ServiceInfo | undefined {
  return entry.type === 'vector-tiles' && entry.layers ? parseTemplate(tileTemplates(entry.url), entry.layers, entry.name) : undefined;
}

/**
 * What a service read from the library offers, with what the entry knows on top: a
 * service with a single layer takes the entry's name, and a tile template its
 * attribution, bounds and zooms.
 */
export function withEntry(info: ServiceInfo, entry: LibraryEntry): ServiceInfo {
  const single = info.offers.length === 1;
  return {
    ...info,
    title: single ? entry.name : info.title,
    offers: info.offers.map((offer) => {
      if (!offer.draft) return offer;
      const draft: LayerDraft = { ...offer.draft };
      if (single) draft.name = entry.name;
      if (entry.attribution) draft.attribution = entry.attribution;
      if (entry.bounds) draft.bounds = entry.bounds;
      if (draft.source.type === 'xyz' || draft.source.type === 'vector-tiles') {
        draft.source = {
          ...draft.source,
          ...(entry.minzoom !== undefined && { minzoom: entry.minzoom }),
          ...(entry.maxzoom !== undefined && { maxzoom: entry.maxzoom }),
        };
      }
      return { ...offer, title: single ? entry.name : offer.title, draft };
    }),
  };
}
