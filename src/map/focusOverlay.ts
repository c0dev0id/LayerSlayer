import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { createEffect, createMemo, createRoot, createSignal } from 'solid-js';
import { linesOutside } from '../geo/clip';
import { lngLatToMercator, MAX_LATITUDE, mercatorToLngLat, WORLD } from '../geo/mercator';
import type { LngLat } from '../model/route';
import { focusCursor, focusDraft } from '../state/drawing';
import { state } from '../state/store';
import { BACKGROUND_STATE } from './compose';
import { ROUND_LINE, type Overlay } from './overlays';

/**
 * The focus area over the map, and the one being drawn. They are sources of their own,
 * so that moving the pointer while drawing does not re-tile the mask over the world.
 */

const FOCUS_COLOR = '#1c7ed6';
/** The colour of the lines drawn on the cover. */
const COVER_LINES = '#ffffff';

const AREA_SOURCE = 'focus-area';
const DRAFT_SOURCE = 'focus-draft';

/** Coastlines and country borders of the world, from Natural Earth at 1:110 million. */
export interface WorldOutline {
  coastlines: LngLat[][];
  borders: LngLat[][];
}

const kind = (name: string): ExpressionSpecification => ['==', ['get', 'kind'], name];

/** The layer that hides the map outside the focus area: a tap on it finds no features. */
export const FOCUS_COVER_LAYER = `${AREA_SOURCE}-cover`;

/** How far an edge of the area faces away from the light, 0 to 1. */
const AWAY: ExpressionSpecification = ['max', 0, ['-', ['get', 'facing']]];
/** How far an edge of the area faces the light, 0 to 1. */
const TOWARDS: ExpressionSpecification = ['max', 0, ['get', 'facing']];

const AREA_LAYERS: LayerSpecification[] = [
  {
    id: FOCUS_COVER_LAYER,
    type: 'fill',
    source: AREA_SOURCE,
    filter: kind('cover'),
    // The map's background colour, dimmed: 40 % of the way to black.
    paint: { 'fill-color': ['interpolate', ['linear'], 0.4, 0, ['global-state', BACKGROUND_STATE], 1, '#000000'] },
  },
  {
    id: `${AREA_SOURCE}-borders`,
    type: 'line',
    source: AREA_SOURCE,
    filter: kind('border'),
    layout: ROUND_LINE,
    paint: { 'line-color': COVER_LINES, 'line-opacity': 0.35, 'line-width': 1, 'line-dasharray': [3, 2] },
  },
  {
    id: `${AREA_SOURCE}-coastlines`,
    type: 'line',
    source: AREA_SOURCE,
    filter: kind('coast'),
    layout: ROUND_LINE,
    paint: { 'line-color': COVER_LINES, 'line-opacity': 0.55, 'line-width': 1.2 },
  },
  // The area lifted off the cover: a soft shadow all round, deeper beyond the edges that
  // face away from the light, and a bevel inside, light or dark as the edge faces. Each
  // edge is a line of its own, as the corners of a whole ring shoot out when offset.
  {
    id: `${AREA_SOURCE}-shadow`,
    type: 'line',
    source: AREA_SOURCE,
    filter: kind('edge'),
    layout: ROUND_LINE,
    paint: { 'line-color': '#000000', 'line-opacity': 0.25, 'line-width': 6, 'line-offset': 3, 'line-blur': 6 },
  },
  {
    id: `${AREA_SOURCE}-cast-shadow`,
    type: 'line',
    source: AREA_SOURCE,
    filter: kind('edge'),
    layout: ROUND_LINE,
    paint: { 'line-color': '#000000', 'line-opacity': ['*', 0.45, AWAY], 'line-width': ['*', 18, AWAY], 'line-offset': ['*', 9, AWAY], 'line-blur': ['*', 12, AWAY] },
  },
  {
    id: `${AREA_SOURCE}-bevel`,
    type: 'line',
    source: AREA_SOURCE,
    filter: kind('edge'),
    layout: ROUND_LINE,
    paint: {
      'line-color': ['case', ['>', ['get', 'facing'], 0], '#ffffff', '#000000'],
      'line-opacity': ['case', ['>', ['get', 'facing'], 0], ['*', 0.6, TOWARDS], ['*', 0.35, AWAY]],
      'line-width': 3,
      'line-offset': -2.5,
      'line-blur': 1.5,
    },
  },
];

const DRAFT_LAYERS: LayerSpecification[] = [
  {
    id: `${DRAFT_SOURCE}-line`,
    type: 'line',
    source: DRAFT_SOURCE,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: ROUND_LINE,
    paint: { 'line-color': FOCUS_COLOR, 'line-width': 2 },
  },
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
const WORLD_RING: LngLat[] = [
  [-180, -MAX_LATITUDE],
  [180, -MAX_LATITUDE],
  [180, MAX_LATITUDE],
  [-180, MAX_LATITUDE],
  [-180, -MAX_LATITUDE],
];

/** Where the light comes from, east and north: the north-north-west, as in MapLibre's hillshading. */
const LIGHT = [Math.sin((335 * Math.PI) / 180), Math.cos((335 * Math.PI) / 180)] as const;

/** Twice the signed area of a ring: positive when it runs counterclockwise. */
function signedArea(ring: readonly LngLat[]): number {
  let sum = 0;
  ring.forEach(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  });
  return sum;
}

/** How far an edge of a counterclockwise ring faces the light, -1 (away) to 1, on the map. */
function facing(a: LngLat, b: LngLat): number {
  const [ax, ay] = lngLatToMercator(a[0], a[1]);
  const [bx, by] = lngLatToMercator(b[0], b[1]);
  const length = Math.hypot(bx - ax, by - ay);
  // The outside of a counterclockwise ring is to the right of each edge.
  return length === 0 ? 0 : ((by - ay) * LIGHT[0] - (bx - ax) * LIGHT[1]) / length;
}

/** The zoom the world on the cover is shown at while the area fills the view. */
const COVER_WORLD_ZOOM = 4;
/** The size in pixels of the view the area is fitted into for that. */
const FIT_VIEW = 800;

/**
 * The world's outline as the cover shows it: shrunk around the area's centre, so that
 * with the area filling the view the world is at COVER_WORLD_ZOOM, as if the area were
 * raised over its place on a smaller map. The world keeps the map's scale around an area
 * too large for that. The shrinking is done in Web Mercator, where the map is drawn.
 */
function coverWorld(lines: readonly LngLat[][], ring: readonly LngLat[]): LngLat[][] {
  const corners = ring.map(([lng, lat]) => lngLatToMercator(lng, lat));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const [west, east, south, north] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fitZoom = Math.log2(((FIT_VIEW / 512) * WORLD) / Math.max(east - west, north - south));
  const scale = 2 ** -Math.max(0, fitZoom - COVER_WORLD_ZOOM);
  const [cx, cy] = [(west + east) / 2, (south + north) / 2];
  return lines.map((line) =>
    line.map(([lng, lat]) => {
      const [x, y] = lngLatToMercator(lng, lat);
      return mercatorToLngLat(cx + (x - cx) * scale, cy + (y - cy) * scale);
    }),
  );
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
 * The focus area as map features, each marked with its `kind`: the world with the area cut
 * out, to cover what lies outside; on the cover, the world's outline where it is loaded,
 * shrunk around the area and cut off at it; and the area's edges, each with how far it
 * faces the light. The area runs counterclockwise, so the outside of each edge is to its
 * right; MapLibre takes a ring wound like the first as a polygon of its own, so the
 * cut-out runs clockwise, against the world.
 */
export function focusAreaFeatures(focus: readonly LngLat[] | undefined, world?: WorldOutline): GeoJSON.FeatureCollection {
  if (!focus || focus.length < 3) return collection([]);
  const corners = copy(focus);
  const ring = signedArea(corners) > 0 ? corners : [...corners].reverse();
  const closed = [...ring, ring[0]!];
  const onCover = (lines: readonly LngLat[][], kind: string) =>
    linesOutside(coverWorld(lines, ring), ring).map((line) => feature({ type: 'LineString', coordinates: line }, { kind }));
  return collection([
    feature({ type: 'Polygon', coordinates: [WORLD_RING, [...closed].reverse()] }, { kind: 'cover' }),
    ...(world ? [...onCover(world.coastlines, 'coast'), ...onCover(world.borders, 'border')] : []),
    ...ring.map((a, i) => feature({ type: 'LineString', coordinates: [a, closed[i + 1]!] }, { kind: 'edge', facing: facing(a, closed[i + 1]!) })),
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

/** The world's outline, loaded with the first focus area. */
const [worldOutline, setWorldOutline] = createSignal<WorldOutline>();

export const focusAreaOverlay: Overlay = {
  id: AREA_SOURCE,
  data: createRoot(() => {
    createEffect(() => {
      if (state.focus && !worldOutline()) import('./worldOutline.json').then((m) => setWorldOutline(m.default as WorldOutline), () => {});
    });
    return createMemo(() => focusAreaFeatures(state.focus, worldOutline()));
  }),
  layers: AREA_LAYERS,
};

export const focusDraftOverlay: Overlay = {
  id: DRAFT_SOURCE,
  data: createRoot(() => createMemo(() => focusDraftFeatures(focusDraft(), focusCursor()))),
  layers: DRAFT_LAYERS,
};
