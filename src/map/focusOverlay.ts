import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { createMemo, createRoot } from 'solid-js';
import { MAX_LATITUDE } from '../geo/mercator';
import type { LngLat } from '../model/route';
import { focusCursor, focusDraft } from '../state/drawing';
import { state } from '../state/store';

/** The source of the focus area: the dimmed world around it, its outline, and an area being drawn. */
export const FOCUS_SOURCE = 'focus-area';

const FOCUS_COLOR = '#1c7ed6';

const FOCUS_LAYERS: LayerSpecification[] = [
  {
    id: `${FOCUS_SOURCE}-mask`,
    type: 'fill',
    source: FOCUS_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#000000', 'fill-opacity': 0.4 },
  },
  {
    id: `${FOCUS_SOURCE}-line`,
    type: 'line',
    source: FOCUS_SOURCE,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': FOCUS_COLOR, 'line-width': 2 },
  },
  {
    id: `${FOCUS_SOURCE}-corner`,
    type: 'circle',
    source: FOCUS_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      // The first corner closes the area, so it is the larger target.
      'circle-radius': ['case', ['get', 'first'], 7, 4],
      'circle-color': '#ffffff',
      'circle-stroke-color': FOCUS_COLOR,
      'circle-stroke-width': 2,
    },
  },
];

/** The world as far as Web Mercator draws it, counterclockwise. */
const WORLD: LngLat[] = [
  [-180, -MAX_LATITUDE],
  [180, -MAX_LATITUDE],
  [180, MAX_LATITUDE],
  [-180, MAX_LATITUDE],
  [-180, -MAX_LATITUDE],
];

/** Twice the signed area of a ring: positive when it runs counterclockwise. */
function signedArea(ring: readonly LngLat[]): number {
  let sum = 0;
  ring.forEach(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  });
  return sum;
}

const closed = (corners: readonly LngLat[]): LngLat[] => [...corners, corners[0]!];

const feature = <G extends GeoJSON.Geometry>(geometry: G, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<G> => ({
  type: 'Feature',
  properties,
  geometry,
});

/**
 * The focus area as map features: the world with the area cut out, to dim what lies
 * outside, and the area's outline; and the area being drawn, its corners joined in order
 * up to the pointer. MapLibre takes a ring wound like the first as a polygon of its own,
 * so the cut-out runs clockwise, against the world. Coordinates are copied, so the result
 * holds no store proxies.
 */
export function focusFeatures(focus: readonly LngLat[] | undefined, draft?: readonly LngLat[], cursor?: LngLat): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (focus && focus.length >= 3) {
    const corners = focus.map((p): LngLat => [p[0], p[1]]);
    const hole = signedArea(corners) > 0 ? [...corners].reverse() : corners;
    features.push(feature({ type: 'Polygon', coordinates: [WORLD, closed(hole)] }));
    features.push(feature({ type: 'LineString', coordinates: closed(corners) }));
  }
  if (draft && draft.length > 0) {
    const line = cursor ? [...draft, cursor] : draft;
    if (line.length >= 2) features.push(feature({ type: 'LineString', coordinates: line.map((p) => [p[0], p[1]]) }));
    draft.forEach((p, i) => features.push(feature({ type: 'Point', coordinates: [p[0], p[1]] }, { first: i === 0 })));
  }
  return { type: 'FeatureCollection', features };
}

/** The focus area and the one being drawn as they are now, as plain data for the map. */
export const focusLines = createRoot(() => createMemo(() => focusFeatures(state.focus, focusDraft(), focusCursor())));

/** The style with the focus area over every layer, a part of the style like the route lines. */
export function withFocus(style: StyleSpecification, data: GeoJSON.FeatureCollection): StyleSpecification {
  return {
    ...style,
    sources: { ...style.sources, [FOCUS_SOURCE]: { type: 'geojson', data } },
    layers: [...style.layers, ...FOCUS_LAYERS],
  };
}
