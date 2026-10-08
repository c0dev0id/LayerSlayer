import { boxBounds } from '../geo/mercator';
import { resolveUrl } from '../map/urls';
import type { LayerDraft, VectorTilesSource, XyzSource } from '../model/layer';
import type { Offer, ServiceInfo } from './types';

/** The highest tile zoom assumed for a template without a TileJSON: where most vector tile sets end. */
export const TEMPLATE_MAXZOOM = 14;

export interface TileJson {
  name?: string;
  description?: string;
  attribution?: string;
  tiles?: string[];
  scheme?: 'xyz' | 'tms';
  minzoom?: number;
  maxzoom?: number;
  bounds?: number[];
  vector_layers?: { id: string; description?: string; minzoom?: number; maxzoom?: number }[];
}

/**
 * The tile layers of a vector tile set, each offered as a layer of its own, so each is drawn
 * in its own colour and order; under a heading when there are several. A tile layer starts
 * at the zoom its data begins.
 */
function offers(
  title: string,
  base: Omit<VectorTilesSource, 'layer'>,
  layers: readonly { id: string; description?: string; minzoom?: number }[],
  extra: Partial<LayerDraft>,
): Offer[] {
  const nested = layers.length > 1;
  const list = layers.map(
    (l): Offer => ({
      title: l.id,
      name: l.id,
      depth: nested ? 1 : 0,
      ...(l.description && { description: l.description }),
      draft: {
        name: nested ? l.id : title,
        source: { ...base, layer: l.id },
        ...extra,
        ...(l.minzoom !== undefined && l.minzoom > 0 && { minzoom: l.minzoom }),
      },
    }),
  );
  return nested ? [{ title, depth: 0 }, ...list] : list;
}

/** A TileJSON of vector tiles: its tile layers, tile addresses resolved against the TileJSON's. */
export function parseTileJson(json: TileJson, url: string): ServiceInfo {
  if (!Array.isArray(json.tiles) || json.tiles.length === 0) throw new Error('This is not a TileJSON: it lists no tiles.');
  if (!Array.isArray(json.vector_layers) || json.vector_layers.length === 0) {
    throw new Error('This TileJSON lists no vector layers; raster tiles are added by their tile address (XYZ).');
  }
  const title = json.name ?? 'Vector tiles';
  const base: Omit<VectorTilesSource, 'layer'> = {
    type: 'vector-tiles',
    tiles: json.tiles.map((t) => resolveUrl(t, url)),
    ...(json.scheme === 'tms' && { scheme: 'tms' }),
    ...(json.minzoom !== undefined && { minzoom: json.minzoom }),
    ...(json.maxzoom !== undefined && { maxzoom: json.maxzoom }),
  };
  const bounds = boxBounds(json.bounds);
  return {
    title,
    ...(json.description && { description: json.description }),
    offers: offers(title, base, json.vector_layers, { ...(bounds && { bounds }), ...(json.attribution && { attribution: json.attribution }) }),
  };
}

/** A tile template's layers, as read from its tiles. Tiles are taken to end at TEMPLATE_MAXZOOM. */
export function parseTemplate({ tiles, scheme }: Pick<XyzSource, 'tiles' | 'scheme'>, layerNames: readonly string[], title: string): ServiceInfo {
  if (layerNames.length === 0) throw new Error('The tile read from this address holds no layers.');
  const base: Omit<VectorTilesSource, 'layer'> = { type: 'vector-tiles', tiles, ...(scheme === 'tms' && { scheme }), maxzoom: TEMPLATE_MAXZOOM };
  return { title, offers: offers(title, base, layerNames.map((id) => ({ id })), {}) };
}
