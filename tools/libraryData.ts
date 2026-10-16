import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import type { Plugin } from 'vite';
import type { LibraryEntry } from '../src/library/library.ts';
import { REGION_BOUNDS } from '../src/library/regions.ts';

/**
 * The library the app offers in Add layer, merged at build time from two files so each can
 * be edited on its own terms: library.json holds the technical definition of every service
 * (type, address, zooms, bounds, CORS), library.toml the name, region, category and
 * description a maintainer rewords without touching the technical side. An `id` ties the two;
 * every entry in one must have its match in the other. Served as `virtual:library`.
 */

const file = (name: string) => fileURLToPath(new URL(`../src/library/${name}`, import.meta.url));
const TECHNICAL = file('library.json');
const OVERLAY = file('library.toml');

interface Technical {
  id: string;
  [key: string]: unknown;
}
interface Overlay {
  id: string;
  name: string;
  region: string;
  category: string;
  description: string;
}

export function mergeLibrary(): LibraryEntry[] {
  const { entries: technical } = JSON.parse(readFileSync(TECHNICAL, 'utf8')) as { entries: Technical[] };
  const { entries: overlay } = parse(readFileSync(OVERLAY, 'utf8')) as unknown as { entries: Overlay[] };
  const byId = new Map(overlay.map((o) => [o.id, o]));
  const entries = technical.map(({ id, ...tech }) => {
    const text = byId.get(id);
    if (!text) throw new Error(`library.toml has no entry for "${id}".`);
    if (text.region !== 'Global' && !REGION_BOUNDS[text.region]) {
      throw new Error(`library.toml entry "${id}" names region "${text.region}", which regions.ts does not cover.`);
    }
    byId.delete(id);
    return { ...tech, name: text.name, region: text.region, category: text.category, note: text.description } as LibraryEntry;
  });
  if (byId.size) throw new Error(`library.toml has entries with no match in library.json: ${[...byId.keys()].join(', ')}.`);
  return entries;
}

const ID = 'virtual:library';

export function libraryData(): Plugin {
  return {
    name: 'library-data',
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load(id) {
      if (id !== `\0${ID}`) return undefined;
      this.addWatchFile(TECHNICAL);
      this.addWatchFile(OVERLAY);
      return `export default ${JSON.stringify({ entries: mergeLibrary() })};`;
    },
  };
}
