import { MAX_LATITUDE } from '../geo/mercator';
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

const HALF_CIRCUMFERENCE = Math.PI * 6378137;

/** The tile's bounding box in EPSG:3857 metres, written as MapLibre writes `{bbox-epsg-3857}`. */
function tileBBox(x: number, y: number, z: number): string {
  const flipped = Math.pow(2, z) - y - 1;
  const coords = (px: number, py: number): [number, number] => {
    const resolution = (2 * HALF_CIRCUMFERENCE) / 256 / Math.pow(2, z);
    return [px * resolution - HALF_CIRCUMFERENCE, py * resolution - HALF_CIRCUMFERENCE];
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
 * The zoom of the tiles a raster source of `tileSize` pixels shows at a whole map zoom:
 * MapLibre draws a 512 px world at zoom 0, so 256 px tiles are one zoom deeper.
 */
export function tileZoom(mapZoom: number, tileSize: number): number {
  return Math.round(mapZoom + Math.log2(512 / tileSize));
}

type Point = [number, number];

/** A position in Web Mercator as a fraction of the world, 0 to 1 from the top left. */
function unit([lng, lat]: LngLat): Point {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
}

/** Whether the segment from a to b passes through the box (Liang–Barsky clipping). */
function segmentMeetsBox([ax, ay]: Point, [bx, by]: Point, [x0, y0, x1, y1]: [number, number, number, number]): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function insideRing([px, py]: Point, ring: readonly Point[]): boolean {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) within = !within;
  }
  return within;
}

/** Tile counts beyond which an area is not walked tile by tile: far more than anyone downloads. */
export const MAX_AREA_TILES = 2_000_000;

/**
 * The tiles at zoom `z` that touch the polygon and, where given, the bounds: those of its
 * bounding box whose square meets an edge of the polygon or lies inside it.
 */
export function* coveringTiles(polygon: readonly LngLat[], z: number, bounds?: Bounds): Generator<TileId> {
  const range = tileRange(polygon, z, bounds);
  if (!range) return;
  const ring = polygon.map(unit);
  const n = Math.pow(2, z);
  for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) {
      const box: [number, number, number, number] = [x / n, y / n, (x + 1) / n, (y + 1) / n];
      const touches = ring.some((point, i) => segmentMeetsBox(point, ring[(i + 1) % ring.length]!, box)) || insideRing([(x + 0.5) / n, (y + 0.5) / n], ring);
      if (touches) yield { z, x, y };
    }
  }
}

/** The tile columns and rows of the polygon's bounding box, cut to the bounds; none where they do not meet. */
export function tileRange(polygon: readonly LngLat[], z: number, bounds?: Bounds): { minX: number; maxX: number; minY: number; maxY: number; count: number } | undefined {
  const points = polygon.map(unit);
  let [west, north, east, south] = [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
  if (bounds) {
    const [bw, bn] = unit([bounds[0], bounds[3]]);
    const [be, bs] = unit([bounds[2], bounds[1]]);
    [west, north, east, south] = [Math.max(west, bw), Math.max(north, bn), Math.min(east, be), Math.min(south, bs)];
    if (west > east || north > south) return undefined;
  }
  const n = Math.pow(2, z);
  const tile = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  const [minX, maxX, minY, maxY] = [tile(west), tile(east), tile(north), tile(south)];
  return { minX, maxX, minY, maxY, count: (maxX - minX + 1) * (maxY - minY + 1) };
}

/** How many tiles at zoom `z` touch the polygon; Infinity where its bounding box holds more than anyone downloads. */
export function countTiles(polygon: readonly LngLat[], z: number, bounds?: Bounds): number {
  const range = tileRange(polygon, z, bounds);
  if (!range) return 0;
  if (range.count > MAX_AREA_TILES) return Infinity;
  let count = 0;
  for (const _ of coveringTiles(polygon, z, bounds)) count++;
  return count;
}
