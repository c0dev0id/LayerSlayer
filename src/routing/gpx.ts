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
 * The legs of a GPX route the file carries the way Garmin calculated for, each with that
 * way as its geometry, keyed as the routing keys it: such a leg is drawn as routed until
 * the route is recalculated or one of its points moves. The other legs are left to the
 * routing. A point that repeats the one before joins its way to the leg it lies on.
 */
function calculatedLegs(points: readonly LngLat[], rpts: readonly LngLat[][], profile: Profile): Route['legs'] {
  const legs: Route['legs'] = {};
  let way: LngLat[] = [];
  points.map(roundLngLat).forEach((to, i, rounded) => {
    const from = rounded[i - 1];
    if (from && (from[0] !== to[0] || from[1] !== to[1])) {
      if (way.length > 0) legs[legKey(profile, from, to)] = encodePolyline(cleanPoints([from, ...way, to]));
      way = [];
    }
    way = way.concat(rpts[i]!);
  });
  return legs;
}

/**
 * Routes and waypoints from a GPX file. A GPX route keeps all its points and each leg is
 * routed with `profile`, but for the legs it carries the way Garmin calculated for; a leg
 * the routing cannot find stays unrouted until one of its points moves. A track is
 * simplified to at most MAX_TRACK_POINTS joined by straight lines, so that it keeps its
 * shape. Unnamed entries are named after the file.
 *
 * GPX ties waypoints to no route or track, so they belong to the file's first route; a file
 * of waypoints alone becomes a route without points, named after the file, to hold them.
 */
export function gpxToRouteData(
  gpx: GpxContent,
  options: { fileName: string; profile: Profile; existing: readonly Route[]; newId: () => string },
): RouteData {
  const lines: { name?: string; points: LngLat[]; legs: Route['legs']; straight: boolean }[] = [
    ...gpx.routes.map((r) => ({ name: r.name, points: r.points, legs: calculatedLegs(r.points, r.rpts, options.profile), straight: false })),
    ...gpx.tracks.map((t) => ({ name: t.name, points: simplifyToCount(t.segments.flat(), MAX_TRACK_POINTS), legs: {}, straight: true })),
  ].filter((l) => l.points.length > 0);
  // Waypoints without a route or track get a route of their own, without points.
  if (lines.length === 0 && gpx.waypoints.length > 0) lines.push({ points: [], legs: {}, straight: false });
  const routes: Route[] = [];
  lines.forEach((line, i) => {
    routes.push({
      id: options.newId(),
      name: line.name ?? (lines.length === 1 ? options.fileName : `${options.fileName} ${i + 1}`),
      profile: options.profile,
      color: nextRouteColor([...options.existing, ...routes]),
      points: cleanPoints(line.points).map((lngLat, j) => ({ id: options.newId(), lngLat, ...(line.straight && j > 0 && { straight: true }) })),
      legs: line.legs,
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
