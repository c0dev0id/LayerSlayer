import { TileType, type Header } from 'pmtiles';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describePmtiles, pmtilesTile, pmtilesTileJson } from './pmtiles';

/** A header as the pmtiles library reads it; only the fields the reader looks at matter. */
const header = (fields: Partial<Header>): Header =>
  ({ tileType: TileType.Mvt, minZoom: 0, maxZoom: 14, minLon: -10, minLat: 40, maxLon: 10, maxLat: 50, centerLon: 0, centerLat: 45, centerZoom: 4, ...fields }) as Header;

const ARCHIVE = 'https://data.example/roads.pmtiles';

describe('describePmtiles', () => {
  it('offers vector tiles by their tile layers, from the zoom each begins', () => {
    const info = describePmtiles(ARCHIVE, 'roads', header({ minZoom: 5, maxZoom: 15 }), {
      attribution: 'USDA Forest Service',
      vector_layers: [{ id: 'road', minzoom: 8 }, { id: 'trail' }],
    });
    expect(info.title).toBe('roads');
    expect(info.offers.map((o) => [o.title, o.depth])).toEqual([
      ['roads', 0],
      ['road', 1],
      ['trail', 1],
    ]);
    expect(info.offers[1]!.draft).toEqual({
      name: 'road',
      source: { type: 'vector-tiles', tiles: [`pmtiles://${ARCHIVE}/{z}/{x}/{y}`], minzoom: 5, maxzoom: 15, layer: 'road' },
      bounds: [-10, 40, 10, 50],
      attribution: 'USDA Forest Service',
      minzoom: 8,
    });
  });

  it('offers image tiles as one raster layer of the size read from a tile', () => {
    const info = describePmtiles(ARCHIVE, 'hillshade', header({ tileType: TileType.Webp, minZoom: 1, maxZoom: 13 }), {}, 512);
    expect(info.offers).toEqual([
      {
        title: 'hillshade',
        depth: 0,
        draft: {
          name: 'hillshade',
          source: { type: 'xyz', tiles: [`pmtiles://${ARCHIVE}/{z}/{x}/{y}`], scheme: 'xyz', tileSize: 512, minzoom: 1, maxzoom: 13 },
          bounds: [-10, 40, 10, 50],
        },
      },
    ]);
  });

  it('turns away vector tiles without layers and tiles it cannot draw', () => {
    expect(() => describePmtiles(ARCHIVE, 'roads', header({}), {})).toThrow('lists no vector layers');
    expect(() => describePmtiles(ARCHIVE, 'roads', header({ tileType: TileType.Mlt }), {})).toThrow('MapLibre Tiles (MLT)');
  });
});

/**
 * A PMTiles archive without compression holding one tile at 0/0/0, as the format lays it
 * out: header, root directory, metadata, tile data.
 */
function archiveBytes(tile: Uint8Array, metadata: object): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(metadata));
  // One entry: tile id 0, run length 1, the tile's length, its offset plus one.
  const directory = new Uint8Array([1, 0, 1, tile.length, 1]);
  const bytes = new Uint8Array(127 + directory.length + json.length + tile.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('PMTiles'));
  view.setUint8(7, 3);
  const at = [127, directory.length, 127 + directory.length, json.length, 0, 0, 127 + directory.length + json.length, tile.length, 1, 1, 1];
  at.forEach((value, i) => view.setBigUint64(8 + i * 8, BigInt(value), true));
  bytes.set([1, 1, 1, TileType.Mvt, 0, 0], 96); // clustered, no compression, MVT, zooms 0 to 0
  [-1800000000, -850000000, 1800000000, 850000000].forEach((e7, i) => view.setInt32(102 + i * 4, e7, true));
  bytes.set(directory, 127);
  bytes.set(json, 127 + directory.length);
  bytes.set(tile, 127 + directory.length + json.length);
  return bytes;
}

describe('reading archives', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Serves `bytes` to range requests and counts them. */
  function serve(bytes: Uint8Array) {
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const range = new Headers(init.headers).get('range')!;
      requests.push(`${url} ${range}`);
      const [from, to] = range.slice('bytes='.length).split('-').map(Number);
      const part = bytes.slice(from, Math.min(to! + 1, bytes.length));
      return new Response(part, { status: 206, headers: { 'Content-Range': `bytes ${from}-${from! + part.length - 1}/${bytes.length}` } });
    });
    return requests;
  }

  it('reads a tile, and gives tiles the archive lacks as empty', async () => {
    const requests = serve(archiveBytes(new Uint8Array([7, 8, 9]), { vector_layers: [{ id: 'road' }] }));
    const url = 'https://data.example/one-tile.pmtiles';
    expect(new Uint8Array(await pmtilesTile(`pmtiles://${url}/0/0/0`, new AbortController().signal))).toEqual(new Uint8Array([7, 8, 9]));
    expect((await pmtilesTile(`pmtiles://${url}/1/0/0`, new AbortController().signal)).byteLength).toBe(0);
    expect(requests.every((r) => r.startsWith(url))).toBe(true);
  });

  it('answers the TileJSON of an archive', async () => {
    serve(archiveBytes(new Uint8Array([1]), { vector_layers: [{ id: 'road' }], attribution: 'Somebody' }));
    const url = 'pmtiles://https://data.example/tilejson.pmtiles';
    expect(await pmtilesTileJson(url)).toMatchObject({ tiles: [`${url}/{z}/{x}/{y}.mvt`], vector_layers: [{ id: 'road' }], attribution: 'Somebody', minzoom: 0, maxzoom: 0 });
  });

  it('says why an archive cannot be read', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(pmtilesTile('pmtiles://https://closed.example/a.pmtiles/0/0/0', new AbortController().signal)).rejects.toThrow(
      'closed.example could not be read: it is unreachable or does not allow this page to read it (CORS).',
    );
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(pmtilesTile('pmtiles://https://gone.example/a.pmtiles/0/0/0', new AbortController().signal)).rejects.toThrow('gone.example answered 404.');
  });
});
