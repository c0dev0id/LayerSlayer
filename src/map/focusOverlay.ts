import type { LayerSpecification } from 'maplibre-gl';
import { createMemo, createRoot } from 'solid-js';
import { MAX_LATITUDE } from '../geo/mercator';
import type { LngLat } from '../model/route';
import { focusCursor, focusDraft } from '../state/drawing';
import { state } from '../state/store';
import { ROUND_LINE, type Overlay } from './overlays';

/**
 * The focus area over the map, and the one being drawn. They are sources of their own,
 * so that moving the pointer while drawing does not re-tile the mask over the world.
 */

const FOCUS_COLOR = '#1c7ed6';

const AREA_SOURCE = 'focus-area';
const DRAFT_SOURCE = 'focus-draft';

const lineLayer = (source: string): LayerSpecification => ({
  id: `${source}-line`,
  type: 'line',
  source,
  filter: ['==', ['geometry-type'], 'LineString'],
  layout: ROUND_LINE,
  paint: { 'line-color': FOCUS_COLOR, 'line-width': 2 },
});

const AREA_LAYERS: LayerSpecification[] = [
  {
    id: `${AREA_SOURCE}-mask`,
    type: 'fill',
    source: AREA_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#000000', 'fill-opacity': 0.4 },
  },
  lineLayer(AREA_SOURCE),
];

const DRAFT_LAYERS: LayerSpecification[] = [
  lineLayer(DRAFT_SOURCE),
  {
    id: `${DRAFT_SOURCE}-corner`,
    type: 'circle',
    source: DRAFT_SOURCE,
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

/** Positions copied out of the store, so that the map gets plain data. */
const copy = (points: readonly LngLat[]): LngLat[] => points.map((p) => [p[0], p[1]]);

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

const feature = (geometry: GeoJSON.Geometry, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry,
});

/**
 * The focus area as map features: the world with the area cut out, to dim what lies
 * outside, and the area's outline. MapLibre takes a ring wound like the first as a polygon
 * of its own, so the cut-out runs clockwise, against the world.
 */
export function focusAreaFeatures(focus: readonly LngLat[] | undefined): GeoJSON.FeatureCollection {
  if (!focus || focus.length < 3) return collection([]);
  const corners = copy(focus);
  const hole = signedArea(corners) > 0 ? [...corners].reverse() : corners;
  return collection([
    feature({ type: 'Polygon', coordinates: [WORLD, [...hole, hole[0]!]] }),
    feature({ type: 'LineString', coordinates: [...corners, corners[0]!] }),
  ]);
}

/** The corners of an area being drawn, joined in order up to the pointer; the first one marked. */
export function focusDraftFeatures(draft: readonly LngLat[] | undefined, cursor?: LngLat): GeoJSON.FeatureCollection {
  if (!draft || draft.length === 0) return collection([]);
  const line = copy(cursor ? [...draft, cursor] : draft);
  return collection([
    ...(line.length >= 2 ? [feature({ type: 'LineString', coordinates: line })] : []),
    ...draft.map((p, i) => feature({ type: 'Point', coordinates: [p[0], p[1]] }, { first: i === 0 })),
  ]);
}

export const focusAreaOverlay: Overlay = {
  id: AREA_SOURCE,
  data: createRoot(() => createMemo(() => focusAreaFeatures(state.focus))),
  layers: AREA_LAYERS,
};

export const focusDraftOverlay: Overlay = {
  id: DRAFT_SOURCE,
  data: createRoot(() => createMemo(() => focusDraftFeatures(focusDraft(), focusCursor()))),
  layers: DRAFT_LAYERS,
};
