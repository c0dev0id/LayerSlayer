import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Accessor } from 'solid-js';
import { isDraped } from './compose';

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

/**
 * The style with the overlays on top of every layer, the last on top, each with its data as
 * it is now. In 3D the overlays' points and labels come after all their lines and areas, so
 * that those make one draped run (see composeStyle).
 */
export function withOverlays(style: StyleSpecification, overlays: readonly Overlay[]): StyleSpecification {
  const sources = { ...style.sources };
  const layers = overlays.flatMap((overlay) => {
    sources[overlay.id] = { type: 'geojson', data: overlay.data(), ...(overlay.attribution && { attribution: overlay.attribution }) };
    return overlay.layers;
  });
  const ordered = style.terrain ? [...layers.filter(isDraped), ...layers.filter((l) => !isDraped(l))] : layers;
  return { ...style, sources, layers: [...style.layers, ...ordered] };
}
