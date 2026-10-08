import type { StyleSpecification } from 'maplibre-gl';

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
 */
export function keepLoadedGeoJson(): (previous: StyleSpecification | undefined, next: StyleSpecification) => StyleSpecification {
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
    return next;
  };
}
