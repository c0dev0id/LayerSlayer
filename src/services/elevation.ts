import { worldFraction } from '../geo/mercator';
import type { LngLat } from '../model/route';
import { fetchResource } from '../state/net';

/** Mapterhorn's elevation tiles: open terrain data, global at about 30 m and finer where countries publish it. */
export const ELEVATION_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

const TILE_SIZE = 512;

/** The zoom elevations are read at: about 13 m a pixel in central Europe. */
const ZOOM = 12;

/** The elevation in metres a Terrarium-encoded pixel holds. */
export const terrarium = (red: number, green: number, blue: number): number => red * 256 + green + blue / 256 - 32768;

/** The tile a point lies in at ZOOM, and its position in the tile's pixels, measured from pixel centres. */
export function tilePosition([lng, lat]: LngLat): { tile: string; x: number; y: number } {
  const n = 2 ** ZOOM;
  const [fx, fy] = worldFraction(lng, lat).map((f) => f * n) as [number, number];
  const [tx, ty] = [Math.min(n - 1, Math.floor(fx)), Math.min(n - 1, Math.floor(fy))];
  return { tile: `${ZOOM}/${tx}/${ty}`, x: (fx - tx) * TILE_SIZE - 0.5, y: (fy - ty) * TILE_SIZE - 0.5 };
}

/** The elevation at a position in a tile, interpolated between the four pixels around it, the tile's edge pixels reaching to its edge. */
export function heightAt(heights: Float32Array, x: number, y: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(TILE_SIZE - 1, v));
  const [cx, cy] = [clamp(x), clamp(y)];
  const [x0, y0] = [Math.floor(cx), Math.floor(cy)];
  const [x1, y1] = [Math.min(x0 + 1, TILE_SIZE - 1), Math.min(y0 + 1, TILE_SIZE - 1)];
  const [dx, dy] = [cx - x0, cy - y0];
  const at = (px: number, py: number) => heights[py * TILE_SIZE + px]!;
  const top = at(x0, y0) * (1 - dx) + at(x1, y0) * dx;
  const bottom = at(x0, y1) * (1 - dx) + at(x1, y1) * dx;
  return top * (1 - dy) + bottom * dy;
}

/** The ground's elevation in metres at each point, reading each tile they lie in once. */
export async function elevationsAt(points: readonly LngLat[]): Promise<number[]> {
  const positions = points.map(tilePosition);
  const tiles = [...new Set(positions.map((p) => p.tile))];
  const heights = new Map(await Promise.all(tiles.map(async (tile) => [tile, await tileHeights(tile)] as const)));
  return positions.map(({ tile, x, y }) => heightAt(heights.get(tile)!, x, y));
}

/** A tile's elevations, row by row. */
async function tileHeights(tile: string): Promise<Float32Array> {
  const [z, x, y] = tile.split('/');
  const response = await fetchResource(ELEVATION_TILES.replace('{z}', z!).replace('{x}', x!).replace('{y}', y!));
  // Colour management would change the values the colours encode.
  const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const context = new OffscreenCanvas(TILE_SIZE, TILE_SIZE).getContext('2d')!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const heights = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let i = 0; i < heights.length; i++) heights[i] = terrarium(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  return heights;
}
