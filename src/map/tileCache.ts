/**
 * Feature tiles kept in the browser's Cache Storage across sessions. Feature servers answer
 * slowly and often forbid HTTP caching (ArcGIS Online sends max-age=300), so a tile that was
 * queried once is answered from here until it is a day old.
 */

/** Bumped when the encoding of cached tiles changes, so old tiles are not read back. */
const CACHE_NAME = 'webmap-feature-tiles-v1';

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

export async function storeTile(key: string, data: ArrayBuffer, caches = storage(), now = Date.now()): Promise<void> {
  if (!caches) return;
  const response = new Response(data, { headers: { 'content-type': 'application/x-protobuf', [STORED_AT]: String(now) } });
  await (await caches.open(CACHE_NAME)).put(key, response);
}

/** Deletes tiles past the maximum age, and caches of older encodings. */
export async function sweepTileCache(caches = storage(), now = Date.now()): Promise<void> {
  if (!caches) return;
  for (const name of await caches.keys()) {
    if (name.startsWith('webmap-feature-tiles') && name !== CACHE_NAME) await caches.delete(name);
  }
  const cache = await caches.open(CACHE_NAME);
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response || !fresh(response, now)) await cache.delete(request);
  }
}

export async function countCachedTiles(caches = storage()): Promise<number> {
  return caches ? (await (await caches.open(CACHE_NAME)).keys()).length : 0;
}

export async function clearTileCache(caches = storage()): Promise<void> {
  await caches?.delete(CACHE_NAME);
}
