import { simplifyToCount } from '../geo/simplify';
import type { LngLat, Profile, Route, RouteData } from '../model/route';
import type { GpxContent, Track } from '../services/gpx';
import { legKey, roundLngLat, routePoints, withoutRepeats } from './legs';
import { decodePolyline, encodePolyline } from './polyline';
import { nextRouteColor } from './routeEdit';

/** Routes as GPX tracks, and the content of a GPX file as routes and waypoints. */

/** Tracks for every route with at least two points. */
export function routeTracks(routes: readonly Route[], decode = decodePolyline): Track[] {
  return routes.filter((r) => r.points.length >= 2).map((r) => ({ name: r.name, points: routePoints(r, decode) }));
}

/** Tracks are simplified to at most this many points, each a marker while the route is drawn. */
export const MAX_TRACK_POINTS = 500;

/** Rounded positions without consecutive repeats, which would make legs of no length. */
const cleanPoints = (points: readonly LngLat[]) => withoutRepeats(points.map(roundLngLat));

/**
 * A Garmin route's points, with the way calculated from each on to the next as the
 * geometry of their leg, keyed as the routing keys it: the leg is drawn as routed until the
 * route is recalculated or one of its points moves. A point that repeats the one before is
 * left out, its way joining the leg it lies on.
 */
function withGarminWays(points: readonly LngLat[], ways: readonly LngLat[][], profile: Profile): Pick<Route, 'legs'> & { points: LngLat[] } {
  const kept: LngLat[] = [];
  const legs: Record<string, string> = {};
  let way: LngLat[] = [];
  points.map(roundLngLat).forEach((point, i) => {
    const last = kept.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      if (last) legs[legKey(profile, last, point)] = encodePolyline(withoutRepeats([...way, point].map(roundLngLat)));
      kept.push(point);
      way = [];
    }
    way.push(...ways[i]!);
  });
  return { points: kept, legs };
}

/**
 * Routes and waypoints from a GPX file. A GPX route keeps all its points and each leg is
 * routed with `profile`; a leg the routing cannot find stays unrouted until one of its
 * points moves. A route with the ways Garmin calculated between its points keeps them as
 * its legs' geometry instead. A track is simplified to at most MAX_TRACK_POINTS joined by
 * straight lines, so that it keeps its shape. Unnamed entries are named after the file.
 *
 * GPX ties waypoints to no route or track, so they belong to the file's first route; a file
 * of waypoints alone becomes a route without points, named after the file, to hold them.
 */
export function gpxToRouteData(
  gpx: GpxContent,
  options: { fileName: string; profile: Profile; existing: readonly Route[]; newId: () => string },
): RouteData {
  const lines: { name?: string | undefined; points: LngLat[]; ways?: LngLat[][] | undefined; routed: boolean }[] = [
    ...gpx.routes.map((r) => ({ name: r.name, points: r.points, ways: r.ways, routed: true })),
    ...gpx.tracks.map((t) => ({ name: t.name, points: t.segments.flat(), routed: false })),
  ].filter((l) => l.points.length > 0);
  // Waypoints without a route or track get a route of their own, without points.
  if (lines.length === 0 && gpx.waypoints.length > 0) lines.push({ points: [], routed: true });
  const routes: Route[] = [];
  lines.forEach((line, i) => {
    const { points, legs } = line.ways
      ? withGarminWays(line.points, line.ways, options.profile)
      : { points: cleanPoints(line.routed ? line.points : simplifyToCount(line.points, MAX_TRACK_POINTS)), legs: {} };
    routes.push({
      id: options.newId(),
      name: line.name ?? (lines.length === 1 ? options.fileName : `${options.fileName} ${i + 1}`),
      profile: options.profile,
      color: nextRouteColor([...options.existing, ...routes]),
      points: points.map((lngLat, j) => ({ id: options.newId(), lngLat, ...(!line.routed && j > 0 && { straight: true }) })),
      legs,
    });
  });
  const routeId = routes[0]?.id ?? '';
  const waypoints = gpx.waypoints.map((w, i) => ({
    id: options.newId(),
    routeId,
    lngLat: roundLngLat(w.lngLat),
    name: w.name ?? `Waypoint ${i + 1}`,
    ...(w.description && { description: w.description }),
  }));
  return { routes, waypoints };
}
