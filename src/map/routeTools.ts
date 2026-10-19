import type { Map as MapLibreMap } from 'maplibre-gl';
import { nearestLine, type XY } from '../geo/nearest';
import type { LngLat } from '../model/route';
import { legCoordinates, roundLngLat, routeLegs } from '../routing/legs';
import { routeLines, type TapeEnd } from '../state/measure';
import { insertPoint, routeById } from '../state/routes';

/** Points as the map shows them on screen, in CSS pixels. */
function onScreen(map: MapLibreMap, points: readonly LngLat[]): XY[] {
  return points.map((p) => {
    const { x, y } = map.project(p);
    return [x, y];
  });
}

/**
 * Inserts a point into the route where a tap hits its line (within `tolerance` CSS
 * pixels): on the nearest leg, at the closest place on the line, so the route keeps its
 * shape until the point is moved. Returns whether a point was inserted.
 */
export function insertPointOnLine(map: MapLibreMap, routeId: string, tap: XY, tolerance: number): boolean {
  const route = routeById(routeId);
  if (!route) return false;
  const lines = routeLegs(route).map((leg) => onScreen(map, legCoordinates(route, leg)));
  const hit = nearestLine(lines, tap);
  if (!hit || hit.distance > tolerance) return false;
  const { lng, lat } = map.unproject([hit.point[0], hit.point[1]]).wrap();
  insertPoint(routeId, hit.index + 1, roundLngLat([lng, lat]));
  return true;
}

/**
 * An end of the measuring tape at a spot on screen: on the nearest route's line where one
 * passes within `tolerance` CSS pixels, otherwise at the spot itself.
 */
export function tapeEndAt(map: MapLibreMap, spot: XY, tolerance: number): TapeEnd {
  const routes = routeLines();
  const hit = nearestLine(
    routes.map((r) => onScreen(map, r.line)),
    spot,
  );
  const onRoute = hit && hit.distance <= tolerance ? hit : undefined;
  const at = onRoute?.point ?? spot;
  const { lng, lat } = map.unproject([at[0], at[1]]).wrap();
  return { at: [lng, lat], ...(onRoute && { routeId: routes[onRoute.index]!.id }) };
}
