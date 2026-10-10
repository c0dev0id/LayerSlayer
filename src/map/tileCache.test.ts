import { describe, expect, it } from 'vitest';
import { cachedTile, clearTileCache, keptTile, storeTile, sweepTileCache, tileCacheStats } from './tileCache';

/** Enough of Cache Storage for the cache: open, match, matchAll, put, delete, keys. */
function fakeCaches(): CacheStorage {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (key: string | Request) => store.get(typeof key === 'string' ? key : key.url)?.clone(),
      matchAll: async () => [...store.values()].map((r) => r.clone()),
      put: async (key: string, response: Response) => void store.set(key, response),
      delete: async (key: string | Request) => store.delete(typeof key === 'string' ? key : key.url),
      keys: async () => [...store.keys()].map((url) => ({ url }) as Request),
    } as unknown as Cache;
  };
  return {
    open,
    delete: async (name: string) => stores.delete(name),
    keys: async () => [...stores.keys()],
  } as unknown as CacheStorage;
}

const HOUR = 3600_000;

describe('tile cache', () => {
  it('answers stored tiles until they are a day old', async () => {
    const caches = fakeCaches();
    await storeTile('https://a/q?1', new Uint8Array([1, 2, 3]).buffer, { caches, now: 0 });
    expect(new Uint8Array((await cachedTile('https://a/q?1', caches, 23 * HOUR))!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await cachedTile('https://a/q?1', caches, 25 * HOUR)).toBeUndefined();
    expect(await cachedTile('https://a/q?2', caches, 0)).toBeUndefined();
  });

  it('keeps precached tiles until the cache is cleared, and tells them apart', async () => {
    const caches = fakeCaches();
    await storeTile('https://a/p', new Uint8Array([1, 2]).buffer, { always: true, caches, now: 0 });
    await storeTile('https://a/d', new Uint8Array([3]).buffer, { caches, now: 0 });
    const kept = await keptTile('https://a/p', caches, 1000 * HOUR);
    expect(kept).toMatchObject({ bytes: 2, always: true });
    expect(new Uint8Array(await kept!.data())).toEqual(new Uint8Array([1, 2]));
    expect(await keptTile('https://a/d', caches, HOUR)).toMatchObject({ bytes: 1, always: false });
    expect(await keptTile('https://a/d', caches, 25 * HOUR)).toBeUndefined();
    await sweepTileCache(caches, 1000 * HOUR);
    expect(await tileCacheStats(caches)).toEqual({ tiles: 1, bytes: 2 });
  });

  it('keeps empty tiles, which spare a query just the same', async () => {
    const caches = fakeCaches();
    await storeTile('https://a/q?e', new ArrayBuffer(0), { caches, now: 0 });
    expect((await cachedTile('https://a/q?e', caches, 1))?.byteLength).toBe(0);
  });

  it('sweeps old tiles and measures and clears the rest', async () => {
    const caches = fakeCaches();
    await storeTile('https://a/old', new ArrayBuffer(1), { caches, now: 0 });
    await storeTile('https://a/new', new ArrayBuffer(1000), { caches, now: 20 * HOUR });
    await storeTile('https://a/empty', new ArrayBuffer(0), { caches, now: 20 * HOUR });
    await sweepTileCache(caches, 30 * HOUR);
    expect(await tileCacheStats(caches)).toEqual({ tiles: 2, bytes: 1000 });
    await clearTileCache(caches);
    expect(await tileCacheStats(caches)).toEqual({ tiles: 0, bytes: 0 });
  });

  it('deletes tile caches of earlier versions and names, and leaves other caches alone', async () => {
    const caches = fakeCaches();
    for (const name of ['webmap-tiles-v2', 'layerslayer-tiles-v0', 'other-app']) await caches.open(name);
    await storeTile('https://a/q', new ArrayBuffer(1), { caches, now: 0 });
    await sweepTileCache(caches, 1);
    expect(await caches.keys()).toEqual(['other-app', 'layerslayer-tiles-v2']);
  });

  it('does nothing where the page has no Cache Storage', async () => {
    expect(await cachedTile('https://a/q', undefined)).toBeUndefined();
    await storeTile('https://a/q', new ArrayBuffer(1), undefined);
    expect(await tileCacheStats(undefined)).toEqual({ tiles: 0, bytes: 0 });
  });
});
