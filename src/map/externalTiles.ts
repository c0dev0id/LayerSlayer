import type { LayerSource, WmtsSource } from '../model/layer';
import { wmsGetMapUrl, wmtsTileUrl } from './compose';
import { hasPlaceholders } from './urls';

/**
 * A layer's tiles as an address other apps fill in themselves, such as DMD2's custom
 * raster maps: https, and either only {z}, {x} and {y} with y counted from the top, or a
 * WMS GetMap with only {bbox}, the tile's extent in Web Mercator metres. Subdomain lists,
 * {-y}, tile matrix names and raster archives are not taken.
 */

/** Whether an address is one other apps fill in themselves. */
export function isExternalTileUrl(template: string): boolean {
  if (!/^https:\/\//i.test(template)) return false;
  const filled = ['{z}', '{x}', '{y}'].every((p) => template.includes(p)) ? template.replace(/\{[xyz]\}/g, '') : template.replace('{bbox}', '');
  return filled !== template && !hasPlaceholders(filled);
}

/** Pixels across a WMS tile in the address given out, as tile apps draw 256-pixel tiles. */
const WMS_TILE_SIZE = 256;

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
 * The address of a raster source's tiles that other apps fill in themselves, where it has
 * one: an XYZ template counted from the top (cached ArcGIS map services among them), a
 * WMTS whose tile matrices are named by their zoom, or a WMS GetMap.
 */
export function externalTileUrl(source: LayerSource): string | undefined {
  const template =
    source.type === 'xyz' && source.scheme === 'xyz'
      ? source.tiles[0]
      : source.type === 'wmts'
        ? wmtsZoomUrl(source)
        : source.type === 'wms'
          ? wmsGetMapUrl(source, '{bbox}', WMS_TILE_SIZE)
          : undefined;
  return template && isExternalTileUrl(template) ? template : undefined;
}
