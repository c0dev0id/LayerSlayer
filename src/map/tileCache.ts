/**
 * Tiles of the layers that keep them, in the browser's Cache Storage across sessions. Slow
 * servers often forbid HTTP caching too (ArcGIS Online sends max-age=300), so a tile that
 * was fetched once is answered from here until it is a day old. Keys are the addresses that
 * answer the tiles: the tile URL, or for a feature tile its query.
 */

/** Bumped when what is kept for a tile changes, so old entries are not read back. */
const CACHE_NAME = 'webmap-tiles-v2';

export const TILE_MAX_AGE_HOURS = 24;
const MAX_AGE_MS = TILE_MAX_AGE_HOURS * 3600_000;
const STORED_AT = 'x-webmap-stored-at';

/** Cache Storage, where the page has it (secure contexts only). */
function storage(): CacheStorage | undefined {
  return globalThis.caches;
}

function fresh(response: Response, now: number): boolean {
  return now - Number(response.headers.get(STORED_AT) ?? 0) < MAX_AGE_MS;
}

/** The tile stored under `key` (its query address), if it is younger than the maximum age. */
export async function cachedTile(key: string, caches = storage(), now = Date.now()): Promise<ArrayBuffer | undefined> {
  if (!caches) return undefined;
  const response = await (await caches.open(CACHE_NAME)).match(key);
  return response && fresh(response, now) ? response.arrayBuffer() : undefined;
}

/** Stores a tile with the time it was stored and its size, which lets the cache be measured without reading the tiles. */
export async function storeTile(key: string, data: ArrayBuffer, caches = storage(), now = Date.now()): Promise<void> {
  if (!caches) return;
  const headers = { 'content-type': 'application/x-protobuf', 'content-length': String(data.byteLength), [STORED_AT]: String(now) };
  const response = new Response(data, { headers });
  await (await caches.open(CACHE_NAME)).put(key, response);
}

/** Deletes tiles past the maximum age, and tile caches of earlier versions. */
export async function sweepTileCache(caches = storage(), now = Date.now()): Promise<void> {
  if (!caches) return;
  for (const name of await caches.keys()) {
    if (name.startsWith('webmap-') && name.includes('tiles') && name !== CACHE_NAME) await caches.delete(name);
  }
  const cache = await caches.open(CACHE_NAME);
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response || !fresh(response, now)) await cache.delete(request);
  }
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
