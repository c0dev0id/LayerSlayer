import { VECTOR_COLORS } from '../model/layer';
import type { LngLat, Profile, Route, RoutePoint } from '../model/route';
import { pruneLegs, routedLegs } from './legs';

/** Pure route edits. Each result keeps exactly the cached legs it still needs. */

function withPrunedLegs(route: Route): Route {
  return { ...route, legs: pruneLegs(route) };
}

export function appendPoint(route: Route, point: RoutePoint): Route {
  return withPrunedLegs({ ...route, points: [...route.points, point] });
}

/** Inserts a point before the one at `index`, splitting the leg that led there; both halves keep its kind. */
export function insertPoint(route: Route, index: number, point: RoutePoint): Route {
  const split = route.points[index]?.straight ? { ...point, straight: true } : point;
  return withPrunedLegs({ ...route, points: [...route.points.slice(0, index), split, ...route.points.slice(index)] });
}

export function movePoint(route: Route, id: string, lngLat: LngLat): Route {
  return withPrunedLegs({ ...route, points: route.points.map((p) => (p.id === id ? { ...p, lngLat } : p)) });
}

export function removePoint(route: Route, id: string): Route {
  return withPrunedLegs({ ...route, points: route.points.filter((p) => p.id !== id) });
}

export function changeProfile(route: Route, profile: Profile): Route {
  return withPrunedLegs({ ...route, profile });
}

/** Stores a routed leg if the route still needs it (the request may be outdated). */
export function addLeg(route: Route, key: string, geometry: string): Route {
  if (!routedLegs(route).some((leg) => leg.key === key)) return route;
  return { ...route, legs: { ...route.legs, [key]: geometry } };
}

/** The first colour of the vector layers' palette not used by another route. */
export function nextRouteColor(routes: readonly Pick<Route, 'color'>[]): string {
  const used = new Set(routes.map((r) => r.color));
  return VECTOR_COLORS.find((c) => !used.has(c)) ?? VECTOR_COLORS[routes.length % VECTOR_COLORS.length]!;
}
