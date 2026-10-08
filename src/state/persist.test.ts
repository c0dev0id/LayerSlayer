import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistedStore } from './persist';

const parse = (json: string) => JSON.parse(json) as { items: number[] };
const empty = () => ({ items: [] as number[] });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('persistedStore', () => {
  it('starts from what is stored, or from the fallback', () => {
    localStorage.setItem('k', '{"items":[1]}');
    expect(persistedStore('k', 'items', parse, empty)[0].items).toEqual([1]);
    expect(persistedStore('other', 'items', parse, empty)[0].items).toEqual([]);
  });

  it('falls back when the stored text cannot be read', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('k', 'not json');
    expect(persistedStore('k', 'items', parse, empty)[0].items).toEqual([]);
  });

  it('saves writes made together once', async () => {
    const [store, set] = persistedStore('k', 'items', parse, empty);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    set('items', (items) => [...items, 1]);
    set('items', (items) => [...items, 2]);
    await Promise.resolve();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('k')).toBe('{"items":[1,2]}');
    expect(store.items).toEqual([1, 2]);
  });
});
