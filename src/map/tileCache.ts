/**
 * Tiles of the layers that keep them, in the browser's Cache Storage across sessions. Slow
 * servers often forbid HTTP caching too (ArcGIS Online sends max-age=300), so a tile that
 * was fetched once is answered from here until it is a day old; a precached tile is kept
 * until the cache is cleared. Keys are the addresses that answer the tiles: the tile URL,
 * or for a feature tile its query.
 */

/** Bumped when what is kept for a tile changes, so old entries are not read back. */
const CACHE_NAME = 'layerslayer-tiles-v2';
/** Tile caches of earlier versions, and of the app before it was renamed from webmap. */
const TILE_CACHE = /^(layerslayer|webmap)-tiles/;

export const TILE_MAX_AGE_HOURS = 24;
const MAX_AGE_MS = TILE_MAX_AGE_HOURS * 3600_000;
/** When a tile stops being answered from the cache, in ms since 1970, or `never` for a precached one. */
const EXPIRES = 'x-layerslayer-expires';

/** Cache Storage, where the page has it (secure contexts only). */
function storage(): CacheStorage | undefined {
  return globalThis.caches;
}

function fresh(response: Response, now: number): boolean {
  const expires = response.headers.get(EXPIRES);
  return expires === 'never' || now < Number(expires ?? 0);
}

/** The tile stored under `key` (its query address), if it is younger than the maximum age. */
export async function cachedTile(key: string, caches = storage(), now = Date.now()): Promise<ArrayBuffer | undefined> {
  if (!caches) return undefined;
  const response = await (await caches.open(CACHE_NAME)).match(key);
  return response && fresh(response, now) ? response.arrayBuffer() : undefined;
}

/** A tile in the cache: its size, whether it is kept until the cache is cleared, and its data when asked for. */
export interface KeptTile {
  bytes: number;
  always: boolean;
  data: () => Promise<ArrayBuffer>;
}

/** The fresh tile stored under `key`, without reading it until its data is asked for. */
export async function keptTile(key: string, caches = storage(), now = Date.now()): Promise<KeptTile | undefined> {
  if (!caches) return undefined;
  const response = await (await caches.open(CACHE_NAME)).match(key);
  if (!response || !fresh(response, now)) return undefined;
  return { bytes: Number(response.headers.get('content-length')) || 0, always: response.headers.get(EXPIRES) === 'never', data: () => response.arrayBuffer() };
}

interface StoreOptions {
  /** Kept until the cache is cleared, as a precached tile is, rather than for a day. */
  always?: boolean;
  caches?: CacheStorage | undefined;
  now?: number;
}

/** Stores a tile with when it expires and its size, which lets the cache be measured without reading the tiles. */
export async function storeTile(key: string, data: ArrayBuffer, { always = false, caches = storage(), now = Date.now() }: StoreOptions = {}): Promise<void> {
  if (!caches) return;
  const expires = always ? 'never' : String(now + MAX_AGE_MS);
  const headers = { 'content-type': 'application/x-protobuf', 'content-length': String(data.byteLength), [EXPIRES]: expires };
  const response = new Response(data, { headers });
  await (await caches.open(CACHE_NAME)).put(key, response);
}

/** Deletes tiles past the maximum age, and tile caches of earlier versions and names. */
export async function sweepTileCache(caches = storage(), now = Date.now()): Promise<void> {
  if (!caches) return;
  for (const name of await caches.keys()) {
    if (TILE_CACHE.test(name) && name !== CACHE_NAME) await caches.delete(name);
  }
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    (await cache.keys()).map(async (request) => {
      const response = await cache.match(request);
      if (!response || !fresh(response, now)) await cache.delete(request);
    }),
  );
}

export interface TileCacheStats {
  tiles: number;
  bytes: number;
}

/** How many tiles are kept and their size, from the stored headers. */
export async function tileCacheStats(caches = storage()): Promise<TileCacheStats> {
  if (!caches) return { tiles: 0, bytes: 0 };
  const responses = await (await caches.open(CACHE_NAME)).matchAll();
  const bytes = responses.reduce((sum, r) => sum + (Number(r.headers.get('content-length')) || 0), 0);
  return { tiles: responses.length, bytes };
}

export async function clearTileCache(caches = storage()): Promise<void> {
  await caches?.delete(CACHE_NAME);
}
