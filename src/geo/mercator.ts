import type { Bounds } from '../model/layer';

/** Half the width of the Web Mercator world in metres. */
export const HALF_WORLD = 20037508.342789244;
export const WORLD = 2 * HALF_WORLD;

/** Scale denominator of one 256 px tile covering the world, with OGC's 0.28 mm pixels. */
const SCALE_256_Z0 = WORLD / 256 / 0.00028;

/** The latitude Web Mercator ends at. */
export const MAX_LATITUDE = 85.0511287798;

/** EPSG codes (and ESRI and old aliases) of Web Mercator, the usual one first. */
export const WEB_MERCATOR_CODES = [3857, 900913, 102100, 102113, 3785] as const;

export function isWebMercatorCode(code: number | undefined): boolean {
  return code !== undefined && (WEB_MERCATOR_CODES as readonly number[]).includes(code);
}

/**
 * The map zoom at a scale denominator. MapLibre's zoom 0 shows the world 512 px wide, one
 * zoom below a 256 px tile pyramid's zoom 0.
 */
export function scaleToZoom(scaleDenominator: number): number {
  return Math.log2(SCALE_256_Z0 / scaleDenominator) - 1;
}

/** The tile zoom whose tiles of `tileSize` pixels have `resolution` metres per pixel, if it is a whole zoom. */
export function tileZoom(resolution: number, tileSize: number): number | undefined {
  const z = Math.log2(WORLD / (tileSize * resolution));
  const rounded = Math.round(z);
  return Math.abs(z - rounded) < 0.01 && rounded >= 0 ? rounded : undefined;
}

export function lngLatToMercator(lng: number, lat: number): [number, number] {
  const x = (lng / 180) * HALF_WORLD;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / Math.PI) * HALF_WORLD;
  return [x, y];
}

/** The XYZ tile at zoom `z` that holds a position, rows counted from the north. */
export function tileAt(lng: number, lat: number, z: number): { x: number; y: number } {
  const [mx, my] = lngLatToMercator(lng, Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)));
  const n = 2 ** z;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, Math.floor(v)));
  return { x: clamp(((mx + HALF_WORLD) / WORLD) * n), y: clamp(((HALF_WORLD - my) / WORLD) * n) };
}

export function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / HALF_WORLD) * 180;
  const lat = (Math.atan(Math.exp((y / HALF_WORLD) * Math.PI)) * 360) / Math.PI - 90;
  return [lng, lat];
}

/**
 * Whether bounds span more than half the width or height of the Web Mercator world, the
 * map as it is drawn, so that flying to them would show about the whole world. Area alone
 * misjudges this: data around the globe that leaves out the poles covers less than half
 * the world's area, yet fitting it on screen shows all of it.
 */
export function coversMostOfWorld([west, south, east, north]: Bounds): boolean {
  const clamp = (lat: number) => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const [x1, y1] = lngLatToMercator(west, clamp(south));
  const [x2, y2] = lngLatToMercator(east, clamp(north));
  return (x2 - x1) / WORLD > 0.5 || (y2 - y1) / WORLD > 0.5;
}

/** Bounds clamped to what Web Mercator shows, or undefined when they are not degrees. */
export function validBounds(west: number, south: number, east: number, north: number): Bounds | undefined {
  const values = [west, south, east, north];
  if (values.some((v) => !Number.isFinite(v))) return undefined;
  if (west < -180.0001 || east > 180.0001 || south < -90.0001 || north > 90.0001 || west >= east || south >= north) {
    return undefined;
  }
  return [
    Math.max(-180, west),
    Math.max(-MAX_LATITUDE, south),
    Math.min(180, east),
    Math.min(MAX_LATITUDE, north),
  ];
}

/** Bounds of a box given as west, south, east and north (as in a TileJSON or an OGC API extent). */
export function boxBounds(box: readonly number[] | undefined): Bounds | undefined {
  return box && box.length >= 4 ? validBounds(box[0]!, box[1]!, box[2]!, box[3]!) : undefined;
}

/** Bounds of a Web Mercator extent in metres, clamped to the world first. */
export function mercatorBounds(xmin: number, ymin: number, xmax: number, ymax: number): Bounds | undefined {
  const clamp = (v: number) => Math.max(-HALF_WORLD, Math.min(HALF_WORLD, v));
  const [west, south] = mercatorToLngLat(clamp(xmin), clamp(ymin));
  const [east, north] = mercatorToLngLat(clamp(xmax), clamp(ymax));
  return validBounds(west, south, east, north);
}
