import type { GeoJSONSourceSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Keeps style diffs from loading GeoJSON again that has not changed. MapLibre keeps the
 * GeoJSON it loaded from an address in place of the address, so a diff against the next
 * style, which still has the address, takes the source for changed and loads it again: on
 * any change of any layer, such as dragging an opacity slider.
 *
 * The returned transformStyle remembers the address each source was given. Where the next
 * style gives a source the same address, the current style it is diffed against shows the
 * address again. MapLibre diffs against the very style it passes to transformStyle; were
 * that to change, sources would load again as before, nothing worse.
 *
 * The data of the `overlays` changes through setData alone. Once an overlay is on the map,
 * both styles show the diff the same stand-in for its data, which MapLibre would otherwise
 * clone and compare on every change, however large.
 */
export function keepLoadedGeoJson(overlays: readonly string[] = []): (previous: StyleSpecification | undefined, next: StyleSpecification) => StyleSpecification {
  const given = new Map<string, string>();
  return (previous, next) => {
    for (const [id, source] of Object.entries(previous?.sources ?? {})) {
      const upcoming = next.sources[id];
      if (source.type === 'geojson' && upcoming?.type === 'geojson' && upcoming.data === given.get(id)) source.data = upcoming.data;
    }
    given.clear();
    for (const [id, source] of Object.entries(next.sources)) {
      if (source.type === 'geojson' && typeof source.data === 'string') given.set(id, source.data);
    }
    const shown = overlays.filter((id) => previous?.sources[id]?.type === 'geojson' && next.sources[id]?.type === 'geojson');
    if (shown.length === 0) return next;
    // The next style is MapLibre's to fall back on when a diff fails, so it is copied, not changed.
    const sources = { ...next.sources };
    for (const id of shown) {
      previous!.sources[id] = { ...(previous!.sources[id] as GeoJSONSourceSpecification), data: OVERLAY_DATA };
      sources[id] = { ...(sources[id] as GeoJSONSourceSpecification), data: OVERLAY_DATA };
    }
    return { ...next, sources };
  };
}

/** What a diff sees of an overlay's data. */
const OVERLAY_DATA: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
