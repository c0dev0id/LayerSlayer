import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { createEffect, createMemo, createRoot, createSignal } from 'solid-js';
import { linesOutside } from '../geo/clip';
import { lngLatToMercator, MAX_LATITUDE, mercatorToLngLat, WORLD } from '../geo/mercator';
import type { XY } from '../geo/nearest';
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

/** Twice the signed area of a ring: positive when it runs counterclockwise. */
function signedArea(ring: readonly LngLat[]): number {
  let sum = 0;
  ring.forEach(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  });
  return sum;
}

/** The zoom the world on the cover is shown at while the area fills the view. */
const COVER_WORLD_ZOOM = 4;
/** The size in pixels of the view the area is fitted into for that. */
const FIT_VIEW = 800;

/**
 * How the cover shrinks the world around the area, in Web Mercator: so far that, with the
 * area filling the view, the world is at COVER_WORLD_ZOOM, as if the area were raised over
 * its place on a smaller map. The world keeps the map's scale around an area too large for
 * that.
 */
function coverShrink(area: readonly XY[]): (point: XY) => XY {
  const xs = area.map((p) => p[0]);
  const ys = area.map((p) => p[1]);
  const [west, east, south, north] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fitZoom = Math.log2(((FIT_VIEW / 512) * WORLD) / Math.max(east - west, north - south));
  const scale = 2 ** -Math.max(0, fitZoom - COVER_WORLD_ZOOM);
  const [cx, cy] = [(west + east) / 2, (south + north) / 2];
  return ([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale];
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
 * shrunk around the area and cut off at it. MapLibre takes a ring wound like the first as
 * a polygon of its own, so the cut-out runs clockwise, against the world.
 */
export function focusAreaFeatures(focus: readonly LngLat[] | undefined, world?: WorldOutline): GeoJSON.FeatureCollection {
  if (!focus || focus.length < 3) return collection([]);
  const corners = copy(focus);
  const ring = signedArea(corners) > 0 ? corners : [...corners].reverse();
  const closed = [...ring, ring[0]!];
  // Shrinking and cutting are done in Web Mercator, where the map draws straight lines.
  const area = closed.map(([lng, lat]) => lngLatToMercator(lng, lat));
  const shrink = coverShrink(area);
  const onCover = (lines: readonly LngLat[][], kind: string) =>
    linesOutside(
      lines.map((line) => line.map(([lng, lat]) => shrink(lngLatToMercator(lng, lat)))),
      area,
    ).map((line) => feature({ type: 'LineString', coordinates: line.map(([x, y]) => mercatorToLngLat(x, y)) }, { kind }));
  return collection([
    feature({ type: 'Polygon', coordinates: [WORLD_RING, [...closed].reverse()] }, { kind: 'cover' }),
    ...(world ? [...onCover(world.coastlines, 'coast'), ...onCover(world.borders, 'border')] : []),
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
