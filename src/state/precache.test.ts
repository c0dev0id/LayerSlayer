import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayer, type LayerDraft } from '../model/layer';
import { chosenLayers, estimatedBytes, planPrecache, precacheRun, sampleTiles, startPrecache, tileSource, tileZooms, type PlannedLayer, type TileSource } from './precache';

type Tiled = Extract<PlannedLayer, { source: TileSource }>;
const layer = (draft: LayerDraft, id: string) => createLayer(draft, [], id);
const xyz = (url: string, extra: object = {}) => layer({ name: url, source: { type: 'xyz', tiles: [url], scheme: 'xyz', tileSize: 256, ...extra } }, url);
const wms = layer({ name: 'w', source: { type: 'wms', url: 'https://w.example/ows?', version: '1.3.0', layers: 'a', styles: '', format: 'image/png', crs: 'EPSG:3857' } }, 'w');
const area: [number, number][] = [
  [7.70, 49.08],
  [7.71, 49.08],
  [7.71, 49.09],
  [7.70, 49.09],
];

describe('tileSource', () => {
  it('reads the tiles of raster and vector layers from the style the map is given', () => {
    expect(tileSource(xyz('https://t.example/{z}/{x}/{y}.png', { maxzoom: 17 }))).toEqual({
      templates: ['https://t.example/{z}/{x}/{y}.png'],
      type: 'image',
      tileSize: 256,
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 17,
    });
    const source = tileSource(wms) as TileSource;
    expect(source.tileSize).toBe(512);
    expect(source.templates[0]).toContain('BBOX={bbox-epsg-3857}');
    const vector = tileSource(layer({ name: 'v', source: { type: 'vector-tiles', tiles: ['https://v.example/{z}/{x}/{y}.pbf'], layer: 'roads' } }, 'v'));
    expect(vector).toMatchObject({ type: 'arrayBuffer', tileSize: 512 });
  });

  it('tells why other layers are not precached', () => {
    expect(tileSource(layer({ name: 's', source: { type: 'style', url: 'https://s.example/style.json' } }, 's'))).toBe('is not drawn from tiles');
    expect(tileSource(layer({ name: 'f', source: { type: 'arcgis-features', url: 'https://a/FeatureServer/0', geometry: 'point', maxRecordCount: 1000 } }, 'f'))).toMatch(/features/);
    expect(tileSource({ ...xyz('https://t.example/{z}/{x}/{y}.png'), cache: false })).toMatch(/keeps no tiles/);
    expect(tileSource({ ...xyz('https://t.example/{z}/{x}/{y}.png'), visible: false })).toMatchObject({ type: 'image' });
  });
});

describe('tileZooms', () => {
  const source: TileSource = { templates: [], type: 'image', tileSize: 256, scheme: 'xyz', minzoom: 3, maxzoom: 16 };
  it('asks 256 px tiles one zoom deeper, keeps the deepest for deeper map zooms, and keeps to the layer zooms', () => {
    expect(tileZooms(source, { minzoom: 0, maxzoom: 24 }, 13, 17)).toEqual([
      { mapZoom: 13, z: 14 },
      { mapZoom: 14, z: 15 },
      { mapZoom: 15, z: 16 },
    ]);
    expect(tileZooms({ ...source, tileSize: 512 }, { minzoom: 14.5, maxzoom: 16 }, 13, 17).map((t) => t.z)).toEqual([14, 15]);
    expect(tileZooms(source, { minzoom: 0, maxzoom: 24 }, 0, 1)).toEqual([]);
  });
});

describe('chosenLayers and planPrecache', () => {
  const hidden = { ...xyz('https://h.example/{z}/{x}/{y}.png'), visible: false };
  const osm = xyz('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  it('chooses the open layer, those shown, or all', () => {
    expect(chosenLayers('open', [wms, hidden], 'w')).toEqual([wms]);
    expect(chosenLayers('visible', [wms, hidden], undefined)).toEqual([wms]);
    expect(chosenLayers('all', [wms, hidden], undefined)).toHaveLength(2);
  });

  it('counts the tiles of each zoom and names the policy of the server', () => {
    const [planned, forbidden] = planPrecache([wms, osm], area, 12, 13);
    const { zooms } = planned as Tiled;
    expect(zooms.map((z) => z.z)).toEqual([12, 13]);
    expect(zooms.every((z) => z.count >= 1)).toBe(true);
    expect(forbidden!.policy?.level).toBe('forbidden');
  });
});

describe('startPrecache', () => {
  afterEach(() => vi.unstubAllGlobals());
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]);
  const source = tileSource(xyz('https://t.example/{z}/{x}/{y}.png')) as TileSource;

  it('fetches the tiles one by one, counting those missing on the server', async () => {
    let calls = 0;
    let running = 0;
    let most = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls++;
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return url.includes('/9/') ? new Response('', { status: 404 }) : new Response(png, { headers: { 'content-type': 'image/png' } });
    });
    await startPrecache(
      [
        { source, mapZoom: 7, z: 8, count: 1, pause: 1 },
        { source, mapZoom: 8, z: 9, count: 1, pause: 1 },
      ],
      area,
    );
    expect(precacheRun()).toMatchObject({ status: 'done', total: 2, done: 2, fetched: 1, missing: 1, failed: 0, bytes: png.length });
    expect(calls).toBe(2);
    expect(most).toBe(1);
  });

  it('stops when tile after tile fails, with the reason', async () => {
    vi.stubGlobal('fetch', async () => new Response('busy', { status: 503 }));
    const big: [number, number][] = [
      [7.0, 49.0],
      [8.0, 49.0],
      [8.0, 50.0],
      [7.0, 50.0],
    ];
    await startPrecache([{ source, mapZoom: 11, z: 12, count: 100, pause: 0 }], big);
    expect(precacheRun()).toMatchObject({ status: 'stopped', failed: 20 });
    expect(precacheRun()?.lastError).toContain('503');
  });
});

describe('sampleTiles', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('estimates sizes from sampled tiles, sampling each zoom once', async () => {
    const png = (n: number) => {
      const data = new Uint8Array(n);
      data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      data.set([0x49, 0x45, 0x4e, 0x44], n - 8);
      return data;
    };
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => (asked.push(url), new Response(png(1000), { headers: { 'content-type': 'image/png' } })));
    const big: [number, number][] = [
      [7.6, 49.0],
      [7.8, 49.0],
      [7.8, 49.15],
      [7.6, 49.15],
    ];
    const sampledLayer = xyz('https://s.example/{z}/{x}/{y}.png');
    const [planned] = planPrecache([sampledLayer], big, 13, 13);
    const { source, zooms } = planned as Tiled;
    const jobs = zooms.map((zoom) => ({ source, ...zoom, pause: 1 }));
    expect(estimatedBytes(source, 14, zooms[0]!.count)).toBeUndefined();
    await sampleTiles(jobs, big, new AbortController().signal);
    expect(asked).toHaveLength(3);
    expect(asked.every((u) => u.startsWith('https://s.example/14/'))).toBe(true);
    expect(estimatedBytes(source, 14, zooms[0]!.count)).toBe(zooms[0]!.count * 1000);
    await sampleTiles(jobs, big, new AbortController().signal);
    expect(asked).toHaveLength(3);
  });
});
