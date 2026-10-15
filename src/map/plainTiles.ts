import type { LayerSource, WmtsSource } from '../model/layer';
import { wmtsTileUrl } from './compose';

/**
 * Plain tile addresses: https with only {z}, {x} and {y} to fill in, y counted from the
 * top. Apps that take an online map as a URL template, such as DMD2, take this form and
 * no other: no subdomain lists, no {-y}, no bounding boxes, no tile matrix names.
 */

/** Whether a tile address is plain. */
export function isPlainTileUrl(template: string): boolean {
  return /^https:\/\//i.test(template) && ['{z}', '{x}', '{y}'].every((p) => template.includes(p)) && !/[{}]/.test(template.replace(/\{[xyz]\}/g, ''));
}

/**
 * A WMTS address with the zoom for the tile matrix, where the matrices are named by their
 * zoom (with or without a prefix the app already reads, or with leading zeros).
 */
function wmtsZoomUrl(source: WmtsSource): string {
  const ids = Object.entries(source.matrices);
  const numbered = ids.length > 0 && ids.every(([z, id]) => /^\d+$/.test(id) && Number(id) === Number(z));
  return numbered ? source.template.replace('{TileMatrix}', '{z}').replace('{TileRow}', '{y}').replace('{TileCol}', '{x}') : wmtsTileUrl(source);
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
