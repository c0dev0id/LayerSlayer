import { describe, expect, it, vi } from 'vitest';
import { createLayer, storedFile } from '../model/layer';
import { importFile } from '../services/importFile';
import { addLayer, browserSettings, defaultState, moveItem, parseState, proxiedHostsOf, proxiesHost, replaceLayerFile, state, updateLayer } from './store';

// Stored files in memory, as IndexedDB is not at hand.
const stored = vi.hoisted(() => new Map<string, Blob>());
vi.mock('./files', () => ({
  storeFile: async (blob: Blob) => {
    const key = crypto.randomUUID();
    stored.set(key, blob);
    return key;
  },
  deleteFile: async (key: string) => void stored.delete(key),
}));

describe('parseState', () => {
  it('keeps valid layers and drops malformed ones', () => {
    const valid = defaultState().layers[0]!;
    const state = parseState(
      JSON.stringify({
        layers: [valid, { id: 'x', name: 'broken' }, { ...valid, id: 'y', source: { type: 'mbtiles' } }],
        activeLayerId: 'x',
        settings: { proxy: 'https://p/?u={url}', proxiedHosts: ['a', 1] },
        view: { center: [1, 2], zoom: 3 },
      }),
    );
    expect(state.layers).toEqual([valid]);
    expect(state).not.toHaveProperty('activeLayerId');
    expect(state.settings).toEqual({ proxy: 'https://p/?u={url}', proxiedHosts: ['a'] });
    expect(state.view).toEqual({ center: [1, 2], zoom: 3, bearing: 0, pitch: 0 });
  });

  it('keeps a focus area of at least three corners', () => {
    const corners = [
      [1, 1],
      [2, 1],
      [2, 2],
    ];
    expect(parseState(JSON.stringify({ layers: [], focus: corners })).focus).toEqual(corners);
    expect(parseState(JSON.stringify({ layers: [], focus: corners.slice(1) }))).not.toHaveProperty('focus');
    expect(parseState(JSON.stringify({ layers: [], focus: [[1, 1], [2, 'x'], [2, 2]] }))).not.toHaveProperty('focus');
  });

  it('keeps a background colour only where it is one', () => {
    expect(parseState(JSON.stringify({ layers: [], settings: { background: '#1B2B44' } })).settings.background).toBe('#1B2B44');
    expect(parseState(JSON.stringify({ layers: [], settings: { background: 'red' } })).settings).not.toHaveProperty('background');
    expect(parseState(JSON.stringify({ layers: [], settings: { tileCacheOff: true, proxyMode: 'all' } })).settings).toMatchObject({ tileCacheOff: true, proxyMode: 'all' });
    expect(parseState(JSON.stringify({ layers: [], settings: { proxyMode: 'some' } })).settings).not.toHaveProperty('proxyMode');
    expect(parseState(JSON.stringify({ layers: [], settings: { tileCacheOff: 'yes' } })).settings).not.toHaveProperty('tileCacheOff');
  });

  it('keeps an empty layer list empty', () => {
    expect(parseState('{"layers":[]}').layers).toEqual([]);
  });

  it('throws on text that is not JSON', () => {
    expect(() => parseState('nope')).toThrow();
  });
});

describe('moveItem', () => {
  it('moves up and down and clamps to the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('replaceLayerFile', () => {
  const line = (...coordinates: number[][]) => JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  const AUGUST = Date.UTC(2026, 7, 11);

  it('gives a file layer the new file, keeping its settings and origin, and deleting the old file', async () => {
    const draft = await importFile(new File([line([1, 2], [3, 4])], 'closures.geojson'), 'closures.geojson');
    const layer = addLayer({ ...draft, origin: 'https://data.example/closures.geojson' });
    updateLayer(layer.id, { color: '#123456', opacity: 0.8 });
    const old = storedFile(layer.source)!;
    await replaceLayerFile(layer.id, new File([line([5, 6], [7, 9])], 'closures-2.geojson', { lastModified: AUGUST }));
    const now = state.layers.find((l) => l.id === layer.id)!;
    expect(now).toMatchObject({ color: '#123456', opacity: 0.8, bounds: [5, 6, 7, 9], origin: 'https://data.example/closures.geojson' });
    expect(now.source).toEqual({ type: 'geojson', data: { file: expect.any(String), name: 'closures-2.geojson', modified: '2026-08-11T00:00:00.000Z' } });
    expect(stored.has(old)).toBe(false);
  });

  it('turns away a file of the other kind before reading it', async () => {
    const picture = addLayer({ name: 'Map', source: { type: 'image', data: { file: 'picture', name: 'map.pdf' }, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] } });
    const before = stored.size;
    await expect(replaceLayerFile(picture.id, new File([line([1, 2], [3, 4])], 'roads.geojson'))).rejects.toThrow(
      'roads.geojson cannot replace the file of Map: choose a GeoPDF.',
    );
    expect(stored.size).toBe(before);
    expect(state.layers.find((l) => l.id === picture.id)!.source).toMatchObject({ data: { file: 'picture' } });
  });
});

describe('browserSettings', () => {
  it('are the proxy address and the switches that are on', () => {
    expect(browserSettings({ proxy: 'p', proxiedHosts: ['h'], terrain: true, proxyMode: 'all' })).toEqual({ proxy: 'p', proxyMode: 'all' });
    expect(browserSettings({ proxy: '', proxiedHosts: [], tileCacheOff: false })).toEqual({ proxy: '' });
  });
});

describe('proxiesHost', () => {
  const settings = { proxy: 'https://p.example/?url={url}', proxiedHosts: ['a.example'] };
  it('follows the hosts chosen, none when off, every host when all, and none without an address', () => {
    expect(proxiesHost('a.example', settings)).toBe(true);
    expect(proxiesHost('b.example', settings)).toBe(false);
    expect(proxiesHost('a.example', { ...settings, proxyMode: 'off' })).toBe(false);
    expect(proxiesHost('b.example', { ...settings, proxyMode: 'all' })).toBe(true);
    expect(proxiesHost('a.example', { ...settings, proxy: '' })).toBe(false);
    expect(proxiesHost(undefined, { ...settings, proxyMode: 'all' })).toBe(false);
  });
});

describe('proxiedHostsOf', () => {
  const settings = { proxy: 'https://p.example/?url={url}', proxiedHosts: ['chosen.example'] };
  const wms = createLayer({ name: 'w', source: { type: 'wms', url: 'https://wms.example/ows?', version: '1.3.0', layers: 'a', styles: '', format: 'image/png', crs: 'EPSG:3857' } }, []);
  const xyz = createLayer({ name: 'x', source: { type: 'xyz', tiles: ['https://tiles.example/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } }, []);
  const file = createLayer({ name: 'f', source: { type: 'geojson', data: { file: 'k', name: 'f.geojson' } } }, []);
  it('are the hosts chosen, those of every layer too with all layers, and none when off or without an address', () => {
    expect(proxiedHostsOf(settings, [wms, xyz])).toEqual(['chosen.example']);
    expect(proxiedHostsOf({ ...settings, proxyMode: 'all' }, [wms, xyz, file, wms])).toEqual(['chosen.example', 'wms.example', 'tiles.example']);
    expect(proxiedHostsOf({ ...settings, proxyMode: 'off' }, [wms])).toEqual([]);
    expect(proxiedHostsOf({ ...settings, proxy: '' }, [wms])).toEqual([]);
  });
});
