import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { createMemo, createRoot } from 'solid-js';
import { lineWidth } from '../model/line';
import { ROUTE_LINE_WIDTH, routeOutline, type LngLat, type Route } from '../model/route';
import type { ColoringData } from '../model/routeColoring';
import { legSamples, sampleKey, turnSampleCache } from '../routing/legSamples';
import { isDrawn, legCoordinates, legState, routeLegs } from '../routing/legs';
import { ROUTING_ATTRIBUTION } from '../routing/osrm';
import { decodePolyline } from '../routing/polyline';
import { failedLegs } from '../routing/service';
import { coloringData } from '../state/routeColoring';
import { routeData } from '../state/routes';
import { ROUND_LINE, type Overlay } from './overlays';
import { coloredPieces } from './routeColoring';

/** The source of the route tool's lines. */
const ROUTES_SOURCE = 'route-tool';

/** Legs drawn as part of the route: routed, or straight by choice. Pending and failed legs are dashed. */
const DRAWN: FilterSpecification = ['in', ['get', 'state'], ['literal', ['routed', 'straight']]];

/** What the line layer draws: the pieces of coloured legs, and drawn legs in their route's colour. */
const LINE: FilterSpecification = ['any', ['==', ['get', 'state'], 'piece'], ['all', DRAWN, ['!', ['has', 'colored']]]];

const ROUTE_LAYERS: LayerSpecification[] = [
  {
    id: `${ROUTES_SOURCE}-casing`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: DRAWN,
    layout: ROUND_LINE,
    paint: { 'line-color': ['get', 'outlineColor'], 'line-width': ['+', ['get', 'width'], ['*', 2, ['get', 'outlineWidth']]], 'line-opacity': 0.85 },
  },
  {
    id: `${ROUTES_SOURCE}-line`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: LINE,
    layout: ROUND_LINE,
    paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] },
  },
  {
    id: `${ROUTES_SOURCE}-unrouted`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: ['in', ['get', 'state'], ['literal', ['pending', 'failed']]],
    paint: {
      'line-color': ['match', ['get', 'state'], 'failed', '#d9480f', '#495057'],
      'line-width': 2.5,
      'line-dasharray': [2, 2],
    },
  },
];

/** Decoded leg geometries; polyline strings are immutable, so they are their own cache key. */
let decoded = new Map<string, LngLat[]>();

/**
 * Every leg of every route as a line: routed and straight legs solid in the route's
 * colour and width, pending legs grey dashed, failed legs red dashed. The drawn legs of a
 * coloured route come in pieces of one colour each, where its colouring has the data for
 * them. Coordinates are copied, so the result holds no store proxies.
 */
export function routeFeatures(routes: readonly Route[], failed: ReadonlySet<string>, data: ColoringData): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const decodedNow = new Map<string, LngLat[]>();
  const decode = (geometry: string) => {
    const coordinates = decoded.get(geometry) ?? decodePolyline(geometry);
    decodedNow.set(geometry, coordinates);
    return coordinates;
  };
  turnSampleCache();
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const route of routes) {
    const outline = routeOutline(route.outline);
    const look = { color: route.color, width: lineWidth(route.lineWidth, ROUTE_LINE_WIDTH), outlineColor: outline.color, outlineWidth: outline.width };
    const legs = routeLegs(route);
    const drawn = legs.filter((leg) => isDrawn(route, leg)).map((leg) => ({ key: sampleKey(route, leg), samples: legSamples(route, leg, decode) }));
    const pieces = route.coloring && coloredPieces(route.coloring, drawn, data, route.color);
    for (const leg of legs) {
      const state = legState(route, leg, failed);
      const coordinates = legCoordinates(route, leg, decode).map((p): LngLat => [p[0], p[1]]);
      const colored = pieces?.get(sampleKey(route, leg));
      features.push({ type: 'Feature', properties: { state, ...look, ...(colored && { colored: true }) }, geometry: { type: 'LineString', coordinates } });
      for (const piece of colored ?? []) {
        const properties = { state: 'piece', color: piece.color, width: look.width };
        features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: piece.coordinates } });
      }
    }
  }
  decoded = decodedNow;
  return { type: 'FeatureCollection', features };
}

/** The route lines as they are now, as plain data for the map. */
const routeLines = createRoot(() => createMemo(() => routeFeatures(routeData.routes, failedLegs(), coloringData())));

export const routeOverlay: Overlay = { id: ROUTES_SOURCE, data: routeLines, layers: ROUTE_LAYERS, attribution: ROUTING_ATTRIBUTION };
