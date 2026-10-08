import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Accessor } from 'solid-js';

/**
 * What the app draws over every layer: a GeoJSON source of its own with fixed layers. It
 * is part of the style rather than added to the map, so that applying the next composed
 * style keeps it; a change of its data only replaces the data.
 */
export interface Overlay {
  id: string;
  data: Accessor<GeoJSON.FeatureCollection>;
  layers: LayerSpecification[];
  attribution?: string;
}

/** Rounded joins and ends, for lines drawn over the map. */
export const ROUND_LINE = { 'line-join': 'round', 'line-cap': 'round' } as const;

/** The style with the overlays on top of every layer, the last on top, each with its data as it is now. */
export function withOverlays(style: StyleSpecification, overlays: readonly Overlay[]): StyleSpecification {
  const sources = { ...style.sources };
  const layers = [...style.layers];
  for (const overlay of overlays) {
    sources[overlay.id] = { type: 'geojson', data: overlay.data(), ...(overlay.attribution && { attribution: overlay.attribution }) };
    layers.push(...overlay.layers);
  }
  return { ...style, sources, layers };
}
