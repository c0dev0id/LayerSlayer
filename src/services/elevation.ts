import { worldFraction } from '../geo/mercator';
import { imageProblem } from '../map/imageCheck';
import { tileUrl } from '../map/tileGrid';
import type { LngLat } from '../model/route';
import { fetchResource, hostOf } from '../state/net';

/** Mapterhorn's elevation tiles: open terrain data, global at about 30 m and finer where countries publish it. */
export const ELEVATION_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

export const ELEVATION_TILE_SIZE = 512;

/** The zoom elevations are read at: about 13 m a pixel in central Europe. */
const ZOOM = 12;

/** The elevation in metres a Terrarium-encoded pixel holds. */
export const terrarium = (red: number, green: number, blue: number): number => red * 256 + green + blue / 256 - 32768;

/** The tile a point lies in at ZOOM, and its position in the tile's pixels, measured from pixel centres. */
export function tilePosition([lng, lat]: LngLat): { tile: { z: number; x: number; y: number }; x: number; y: number } {
  const n = 2 ** ZOOM;
  const [fx, fy] = worldFraction(lng, lat).map((f) => f * n) as [number, number];
  const [tx, ty] = [Math.min(n - 1, Math.floor(fx)), Math.min(n - 1, Math.floor(fy))];
  return { tile: { z: ZOOM, x: tx, y: ty }, x: (fx - tx) * ELEVATION_TILE_SIZE - 0.5, y: (fy - ty) * ELEVATION_TILE_SIZE - 0.5 };
}

/**
 * The elevation at a position in a tile's RGBA pixels, interpolated between the four pixels
 * around it, the tile's edge pixels reaching to its edge.
 */
export function heightAt(rgba: Uint8ClampedArray, x: number, y: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(ELEVATION_TILE_SIZE - 1, v));
  const [cx, cy] = [clamp(x), clamp(y)];
  const [x0, y0] = [Math.floor(cx), Math.floor(cy)];
  const [x1, y1] = [Math.min(x0 + 1, ELEVATION_TILE_SIZE - 1), Math.min(y0 + 1, ELEVATION_TILE_SIZE - 1)];
  const [dx, dy] = [cx - x0, cy - y0];
  const at = (px: number, py: number) => {
    const i = (py * ELEVATION_TILE_SIZE + px) * 4;
    return terrarium(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
  };
  const top = at(x0, y0) * (1 - dx) + at(x1, y0) * dx;
  const bottom = at(x0, y1) * (1 - dx) + at(x1, y1) * dx;
  return top * (1 - dy) + bottom * dy;
}

/**
 * The ground's elevation in metres at each point, reading each tile they lie in once. The
 * points of a tile that could not be read get NaN; only when no tile could be read does it
 * fail.
 */
export async function elevationsAt(points: readonly LngLat[]): Promise<number[]> {
  const byTile = new Map<string, { url: string; at: number[] }>();
  const positions = points.map(tilePosition);
  positions.forEach(({ tile }, i) => {
    const url = tileUrl([ELEVATION_TILES], tile);
    const group = byTile.get(url) ?? byTile.set(url, { url, at: [] }).get(url)!;
    group.at.push(i);
  });
  const heights = new Array<number>(points.length).fill(Number.NaN);
  const reads = await Promise.allSettled(
    [...byTile.values()].map(async ({ url, at }) => {
      const rgba = await tilePixels(url);
      for (const i of at) heights[i] = heightAt(rgba, positions[i]!.x, positions[i]!.y);
    }),
  );
  const failed = reads.filter((read): read is PromiseRejectedResult => read.status === 'rejected');
  if (failed.length === reads.length && failed[0]) throw failed[0].reason;
  return heights;
}

/** A canvas to read tiles' pixels from, made on first use. */
let canvas: OffscreenCanvasRenderingContext2D | undefined;

/** A tile's pixels, row by row. */
async function tilePixels(url: string): Promise<Uint8ClampedArray> {
  const answer = await (await fetchResource(url)).arrayBuffer();
  const problem = imageProblem(answer);
  if (problem) throw new Error(`${hostOf(url) ?? url} answered with ${problem} instead of an elevation tile.`);
  // Colour management would change the values the colours encode.
  const image = await createImageBitmap(new Blob([answer]), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  canvas ??= new OffscreenCanvas(ELEVATION_TILE_SIZE, ELEVATION_TILE_SIZE).getContext('2d', { willReadFrequently: true })!;
  canvas.drawImage(image, 0, 0);
  image.close();
  return canvas.getImageData(0, 0, ELEVATION_TILE_SIZE, ELEVATION_TILE_SIZE).data;
}
