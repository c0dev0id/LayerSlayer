/**
 * Tile servers whose operators restrict downloading areas ahead of viewing them, which is
 * what precaching does, or allow it at full speed. Some forbid it outright; others, mostly
 * run by volunteers on donations, ask that their servers not be strained. Any server a
 * layer of this list's hosts uses is found by its host, whatever its subdomain.
 */

export interface BulkPolicy {
  /** Forbidden: the layer is left out. Warned: the user leaves it out or fetches it slowly. Full: fetched at full speed. */
  level: 'forbidden' | 'warn' | 'full';
  /** Who runs the servers, and what they say about it. */
  operator: string;
  says: string;
  /** Where the operator says it; none where the operator says it nowhere public. */
  url?: string;
}

const POLICIES: { host: RegExp; policy: BulkPolicy }[] = [
  {
    host: /(^|\.)tile\.openstreetmap\.org$/,
    policy: {
      level: 'forbidden',
      operator: 'The OpenStreetMap Foundation',
      says: 'forbids downloading tiles ahead of viewing them, saving areas for later included',
      url: 'https://operations.osmfoundation.org/policies/tiles/',
    },
  },
  {
    host: /(^|\.)tiles\.openrailwaymap\.org$/,
    policy: { level: 'forbidden', operator: 'OpenRailwayMap', says: 'forbids bulk requests', url: 'https://wiki.openstreetmap.org/wiki/OpenRailwayMap/API' },
  },
  {
    host: /(^|\.)tile\.opentopomap\.org$/,
    policy: { level: 'warn', operator: 'OpenTopoMap', says: 'asks that mass downloads not strain its server', url: 'https://opentopomap.org/about' },
  },
  {
    host: /(^|\.)(tile-cyclosm|tile)\.openstreetmap\.fr$/,
    policy: { level: 'warn', operator: 'OpenStreetMap France', says: 'runs its tile servers on donations', url: 'https://www.openstreetmap.fr/fonds-de-carte/' },
  },
  {
    host: /(^|\.)tile\.waymarkedtrails\.org$/,
    policy: { level: 'warn', operator: 'Waymarked Trails', says: 'is run by volunteers', url: 'https://waymarkedtrails.org' },
  },
  {
    host: /(^|\.)openinframap\.org$/,
    policy: { level: 'warn', operator: 'Open Infrastructure Map', says: 'is run by volunteers', url: 'https://openinframap.org/about' },
  },
  {
    host: /(^|\.)codevoid\.de$/,
    policy: { level: 'full', operator: 'codevoid.de', says: 'allows downloading at full speed' },
  },
];

/** What the operator of a tile server says about downloading areas, where it says anything. */
export function bulkPolicy(host: string | undefined): BulkPolicy | undefined {
  return host ? POLICIES.find((p) => p.host.test(host))?.policy : undefined;
}
