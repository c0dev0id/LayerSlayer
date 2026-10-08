import { describe, expect, it } from 'vitest';
import { cachedTile, clearTileCache, countCachedTiles, storeTile, sweepTileCache } from './tileCache';

/** Enough of Cache Storage for the cache: open, match, put, delete, keys. */
function fakeCaches(): CacheStorage {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (key: string | Request) => store.get(typeof key === 'string' ? key : key.url)?.clone(),
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
    await storeTile('https://a/q?1', new Uint8Array([1, 2, 3]).buffer, caches, 0);
    expect(new Uint8Array((await cachedTile('https://a/q?1', caches, 23 * HOUR))!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await cachedTile('https://a/q?1', caches, 25 * HOUR)).toBeUndefined();
    expect(await cachedTile('https://a/q?2', caches, 0)).toBeUndefined();
  });

  it('keeps empty tiles, which spare a query just the same', async () => {
    const caches = fakeCaches();
    await storeTile('https://a/q?e', new ArrayBuffer(0), caches, 0);
    expect((await cachedTile('https://a/q?e', caches, 1))?.byteLength).toBe(0);
  });

  it('sweeps old tiles and counts and clears the rest', async () => {
    const caches = fakeCaches();
    await storeTile('https://a/old', new ArrayBuffer(1), caches, 0);
    await storeTile('https://a/new', new ArrayBuffer(1), caches, 20 * HOUR);
    await sweepTileCache(caches, 30 * HOUR);
    expect(await countCachedTiles(caches)).toBe(1);
    await clearTileCache(caches);
    expect(await countCachedTiles(caches)).toBe(0);
  });

  it('does nothing where the page has no Cache Storage', async () => {
    expect(await cachedTile('https://a/q', undefined)).toBeUndefined();
    await storeTile('https://a/q', new ArrayBuffer(1), undefined);
  });
});
