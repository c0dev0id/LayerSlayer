import type { LayerSource, WmtsSource } from '../model/layer';
import { wmtsTileUrl } from './compose';
import { hasPlaceholders } from './urls';

/**
 * Plain tile addresses: https with only {z}, {x} and {y} to fill in, y counted from the
 * top. Apps that take an online map as a URL template, such as DMD2, take this form and
 * no other: no subdomain lists, no {-y}, no bounding boxes, no tile matrix names.
 */

/** Whether a tile address is plain. */
export function isPlainTileUrl(template: string): boolean {
  return /^https:\/\//i.test(template) && ['{z}', '{x}', '{y}'].every((p) => template.includes(p)) && !hasPlaceholders(template.replace(/\{[xyz]\}/g, ''));
}

/**
 * A WMTS address as the map would build it if the tile matrices had no leading zeros
 * (05 read as 5): the zoom where they are named by it, with or without a prefix. The
 * map itself asks for the names as listed, as servers may take nothing else.
 */
function wmtsZoomUrl(source: WmtsSource): string {
  const matrices = Object.fromEntries(Object.entries(source.matrices).map(([z, id]) => [z, /^\d+$/.test(id) ? String(Number(id)) : id]));
  return wmtsTileUrl({ ...source, matrices });
}

/**
 * The plain address of a source's tiles, where its own address is one: an XYZ template
 * counted from the top (cached ArcGIS map services among them), or a WMTS whose tile
 * matrices are named by their zoom.
 */
export function plainTileUrl(source: LayerSource): string | undefined {
  const template = source.type === 'xyz' && source.scheme === 'xyz' ? source.tiles[0] : source.type === 'wmts' ? wmtsZoomUrl(source) : undefined;
  return template && isPlainTileUrl(template) ? template : undefined;
}
