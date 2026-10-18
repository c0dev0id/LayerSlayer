import type { LayerSource, WmtsSource } from '../model/layer';
import { arcgisExportUrl, wmsGetMapUrl, wmtsTileUrl } from './compose';

/**
 * A layer's tiles as an address other apps fill in themselves, such as DMD2's custom
 * raster maps: https, and either only {z}, {x} and {y} with y counted from the top, or a
 * WMS GetMap or ArcGIS export with only {bbox}, the tile's extent in Web Mercator metres.
 * An XYZ template counted from the top (cached ArcGIS map services among them), a WMTS
 * whose tile matrices are named by their zoom, a WMS and an ArcGIS map service without a
 * tile cache have one; subdomain lists, {-y}, other tile matrix names and raster archives
 * do not.
 */

/** Whether an address is one other apps fill in themselves. */
export function isExternalTileUrl(template: string): boolean {
  const names = [...new Set(template.match(/\{[^{}]+\}/g))].sort().join('');
  return /^https:\/\//i.test(template) && (names === '{x}{y}{z}' || names === '{bbox}');
}

/** Pixels across a tile of a WMS or ArcGIS export in the address given out, as tile apps draw 256-pixel tiles. */
const BBOX_TILE_SIZE = 256;

/**
 * A WMTS address as the map would build it if the tile matrices had no leading zeros
 * (05 read as 5): the zoom where they are named by it, with or without a prefix. The
 * map itself asks for the names as listed, as servers may take nothing else.
 */
function wmtsZoomUrl(source: WmtsSource): string {
  const matrices = Object.fromEntries(Object.entries(source.matrices).map(([z, id]) => [z, /^\d+$/.test(id) ? String(Number(id)) : id]));
  return wmtsTileUrl({ ...source, matrices });
}

/** The source's tile address with placeholders, as it would be given out. */
function template(source: LayerSource): string | undefined {
  switch (source.type) {
    case 'xyz':
      return source.scheme === 'xyz' ? source.tiles[0] : undefined;
    case 'wmts':
      return wmtsZoomUrl(source);
    case 'wms':
      return wmsGetMapUrl(source, '{bbox}', BBOX_TILE_SIZE);
    case 'arcgis-map':
      return arcgisExportUrl(source, '{bbox}', BBOX_TILE_SIZE);
    default:
      return undefined;
  }
}

/** The source's tile address in the form other apps fill in, where it has one. */
export function externalTileUrl(source: LayerSource): string | undefined {
  const url = template(source);
  return url && isExternalTileUrl(url) ? url : undefined;
}
