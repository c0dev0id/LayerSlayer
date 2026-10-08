import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { createMemo, createRoot } from 'solid-js';
import type { LngLat, Route } from '../model/route';
import { legCoordinates, legState, routeLegs } from '../routing/legs';
import { ROUTING_ATTRIBUTION } from '../routing/osrm';
import { decodePolyline } from '../routing/polyline';
import { failedLegs } from '../routing/service';
import { routeData } from '../state/routes';
import { ROUND_LINE, type Overlay } from './overlays';

/** The source of the route tool's lines. */
const ROUTES_SOURCE = 'route-tool';

/** Legs drawn as part of the route: routed, or straight by choice. Pending and failed legs are dashed. */
const DRAWN: FilterSpecification = ['in', ['get', 'state'], ['literal', ['routed', 'straight']]];

const ROUTE_LAYERS: LayerSpecification[] = [
  {
    id: `${ROUTES_SOURCE}-casing`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: DRAWN,
    layout: ROUND_LINE,
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 },
  },
  {
    id: `${ROUTES_SOURCE}-line`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: DRAWN,
    layout: ROUND_LINE,
    paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
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
 * colour, pending legs grey dashed, failed legs red dashed. Coordinates are copied, so
 * the result holds no store proxies.
 */
export function routeFeatures(routes: readonly Route[], failed: ReadonlySet<string>): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const cache = new Map<string, LngLat[]>();
  const decode = (geometry: string) => {
    const coordinates = decoded.get(geometry) ?? decodePolyline(geometry);
    cache.set(geometry, coordinates);
    return coordinates;
  };
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const route of routes) {
    for (const leg of routeLegs(route)) {
      const coordinates = legCoordinates(route, leg, decode).map((p): LngLat => [p[0], p[1]]);
      const properties = { state: legState(route, leg, failed), color: route.color };
      features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
    }
  }
  decoded = cache;
  return { type: 'FeatureCollection', features };
}

/** The route lines as they are now, as plain data for the map. */
const routeLines = createRoot(() => createMemo(() => routeFeatures(routeData.routes, failedLegs())));

export const routeOverlay: Overlay = { id: ROUTES_SOURCE, data: routeLines, layers: ROUTE_LAYERS, attribution: ROUTING_ATTRIBUTION };
