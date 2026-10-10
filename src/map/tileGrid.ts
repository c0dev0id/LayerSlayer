import { HALF_WORLD, worldFraction } from '../geo/mercator';
import type { Bounds } from '../model/layer';
import type { LngLat } from '../model/route';

/**
 * Tiles as MapLibre asks for them: which tiles cover an area at a zoom, and the address of
 * each, filled in as MapLibre fills in a source's tile templates. A precached tile is only
 * read back if its address is the very one the map asks for, so `tileUrl` follows MapLibre's
 * `CanonicalTileID.url` (maplibre-gl 6) character for character.
 */

export interface TileId {
  z: number;
  x: number;
  y: number;
}

/** The tile's bounding box in EPSG:3857 metres, written as MapLibre writes `{bbox-epsg-3857}`. */
function tileBBox(x: number, y: number, z: number): string {
  const flipped = Math.pow(2, z) - y - 1;
  const coords = (px: number, py: number): [number, number] => {
    const resolution = (2 * HALF_WORLD) / 256 / Math.pow(2, z);
    return [px * resolution - HALF_WORLD, py * resolution - HALF_WORLD];
  };
  const min = coords(x * 256, flipped * 256);
  const max = coords((x + 1) * 256, (flipped + 1) * 256);
  return `${min[0]},${min[1]},${max[0]},${max[1]}`;
}

function quadkey(z: number, x: number, y: number): string {
  let key = '';
  for (let i = z; i > 0; i--) {
    const mask = 1 << (i - 1);
    key += (x & mask ? 1 : 0) + (y & mask ? 2 : 0);
  }
  return key;
}

/** The address of a tile from a source's templates, as MapLibre picks and fills one. */
export function tileUrl(templates: readonly string[], { z, x, y }: TileId, scheme: 'xyz' | 'tms' = 'xyz', pixelRatio = 1): string {
  return templates[(x + y) % templates.length]!
    .replace(/{prefix}/g, (x % 16).toString(16) + (y % 16).toString(16))
    .replace(/{z}/g, String(z))
    .replace(/{x}/g, String(x))
    .replace(/{y}/g, String(scheme === 'tms' ? Math.pow(2, z) - y - 1 : y))
    .replace(/{ratio}/g, pixelRatio > 1 ? '@2x' : '')
    .replace(/{quadkey}/g, quadkey(z, x, y))
    .replace(/{bbox-epsg-3857}/g, tileBBox(x, y, z));
}

/**
 * The zoom of the tiles a source of `tileSize` pixels shows at a whole map zoom: MapLibre
 * draws a 512 px world at zoom 0, so 256 px tiles are one zoom deeper.
 */
export function sourceTileZoom(mapZoom: number, tileSize: number): number {
  return Math.round(mapZoom + Math.log2(512 / tileSize));
}

type Point = [number, number];

/** Tile counts beyond which a zoom is refused: far more than anyone downloads. */
const MAX_TILES = 2_000_000;

/**
 * The polygon's tiles at a zoom, row by row: for each row, the columns of the tiles that
 * touch the polygon, as spans of columns (first, last). A tile touches it where an edge
 * passes through its square or its centre lies inside; rows and columns keep to the bounds
 * where given.
 */
function* rows(polygon: readonly LngLat[], z: number, bounds?: Bounds): Generator<{ y: number; spans: Point[] }> {
  const ring = polygon.map(([lng, lat]) => worldFraction(lng, lat));
  const n = Math.pow(2, z);
  const tile = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  let [west, north, east, south] = [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))];
  if (bounds) {
    const [bw, bn] = worldFraction(bounds[0], bounds[3]);
    const [be, bs] = worldFraction(bounds[2], bounds[1]);
    [west, north, east, south] = [Math.max(west, bw), Math.max(north, bn), Math.min(east, be), Math.min(south, bs)];
    if (west > east || north > south) return;
  }
  const [minX, maxX] = [tile(west), tile(east)];
  for (let y = tile(north); y <= tile(south); y++) {
    const [top, bottom, middle] = [y / n, (y + 1) / n, (y + 0.5) / n];
    const spans: Point[] = [];
    const crossings: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[(i + 1) % ring.length]!;
      // The part of the edge within the row's band, as a range of x.
      let [t0, t1] = [0, 1];
      if (ay === by) {
        if (ay < top || ay > bottom) continue;
      } else {
        const [ta, tb] = [(top - ay) / (by - ay), (bottom - ay) / (by - ay)];
        [t0, t1] = [Math.max(0, Math.min(ta, tb)), Math.min(1, Math.max(ta, tb))];
        if (t0 > t1) continue;
      }
      const [x0, x1] = [ax + t0 * (bx - ax), ax + t1 * (bx - ax)];
      spans.push([tile(Math.min(x0, x1)), tile(Math.max(x0, x1))]);
      // Where the edge crosses the row's middle, for the tiles whose centres lie inside.
      if (ay > middle !== by > middle) crossings.push(ax + ((middle - ay) * (bx - ax)) / (by - ay));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const [first, last] = [Math.ceil(crossings[i]! * n - 0.5), Math.floor(crossings[i + 1]! * n - 0.5)];
      if (first <= last) spans.push([first, last]);
    }
    yield { y, spans: merge(spans, minX, maxX) };
  }
}

/** Spans of columns joined where they overlap or touch, and cut to the columns from `min` to `max`. */
function merge(spans: Point[], min: number, max: number): Point[] {
  const merged: Point[] = [];
  for (const [a, b] of spans.map(([a, b]): Point => [Math.max(a, min), Math.min(b, max)]).sort((p, q) => p[0] - q[0])) {
    if (a > b) continue;
    const last = merged.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** The tiles at zoom `z` that touch the polygon and, where given, the bounds. */
export function* coveringTiles(polygon: readonly LngLat[], z: number, bounds?: Bounds): Generator<TileId> {
  for (const { y, spans } of rows(polygon, z, bounds)) {
    for (const [first, last] of spans) for (let x = first; x <= last; x++) yield { z, x, y };
  }
}

/** How many tiles at zoom `z` touch the polygon; Infinity beyond what anyone downloads. */
export function countTiles(polygon: readonly LngLat[], z: number, bounds?: Bounds): number {
  let count = 0;
  for (const { spans } of rows(polygon, z, bounds)) {
    for (const [first, last] of spans) count += last - first + 1;
    if (count > MAX_TILES) return Infinity;
  }
  return count;
}

/** Up to `k` of the polygon's tiles at a zoom, spread evenly over them, found by counting rather than walking them. */
export function spreadTiles(polygon: readonly LngLat[], z: number, bounds: Bounds | undefined, k: number): TileId[] {
  const count = countTiles(polygon, z, bounds);
  if (!Number.isFinite(count) || count === 0) return [];
  const wanted = Math.min(k, count);
  const indices = Array.from({ length: wanted }, (_, i) => Math.floor(((i + 0.5) * count) / wanted));
  const picked: TileId[] = [];
  let before = 0;
  for (const { y, spans } of rows(polygon, z, bounds)) {
    for (const [first, last] of spans) {
      const length = last - first + 1;
      while (picked.length < wanted && indices[picked.length]! < before + length) picked.push({ z, x: first + indices[picked.length]! - before, y });
      before += length;
    }
    if (picked.length === wanted) break;
  }
  return picked;
}
