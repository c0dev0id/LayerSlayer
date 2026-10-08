import type { FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { LngLat, Route } from '../model/route';
import { legCoordinates, legState, routeLegs } from '../routing/legs';
import { decodePolyline } from '../routing/polyline';

/** The source of the route tool's lines; no layer id has this form. */
export const ROUTES_SOURCE = 'route-tool';

const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
/** Legs drawn as part of the route: routed, or straight by choice. Pending and failed legs are dashed. */
const DRAWN: FilterSpecification = ['in', ['get', 'state'], ['literal', ['routed', 'straight']]];

const ROUTE_LAYERS: LayerSpecification[] = [
  {
    id: `${ROUTES_SOURCE}-casing`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: DRAWN,
    layout: round,
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 },
  },
  {
    id: `${ROUTES_SOURCE}-line`,
    type: 'line',
    source: ROUTES_SOURCE,
    filter: DRAWN,
    layout: round,
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

/**
 * The style with the route lines on top of every layer. The lines are part of the style
 * rather than added to the map, so that applying the next composed style keeps them.
 */
export function withRoutes(style: StyleSpecification, lines: GeoJSON.FeatureCollection): StyleSpecification {
  return {
    ...style,
    sources: { ...style.sources, [ROUTES_SOURCE]: { type: 'geojson', data: lines } },
    layers: [...style.layers, ...ROUTE_LAYERS],
  };
}
