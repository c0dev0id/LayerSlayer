import type { MapIcon } from './icon';

/** A position as longitude and latitude in degrees. */
export type LngLat = [number, number];

export const isLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** The OSRM profiles the routing server offers. */
export type Profile = 'car' | 'bike' | 'foot';

export const PROFILES: readonly { value: Profile; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'bike', label: 'Bike' },
  { value: 'foot', label: 'Foot' },
];

/** A point a route runs through. */
export interface RoutePoint {
  id: string;
  lngLat: LngLat;
  /** The leg from the point before is a straight line rather than routed: for a way the routing does not know. */
  straight?: boolean;
}

export interface Route {
  id: string;
  name: string;
  profile: Profile;
  color: string;
  /** The points the route runs through, in order. */
  points: RoutePoint[];
  /** Routed geometry per leg as polyline6, keyed by profile and both end points; straight legs have none. */
  legs: Record<string, string>;
  /** How many times their normal size the route's waypoints are drawn, MIN_ICON_SIZE to MAX_ICON_SIZE; 1 where unset. */
  waypointSize?: number;
  /** Width of the route's line in pixels; ROUTE_LINE_WIDTH where unset. */
  lineWidth?: number;
}

/** Width of a route's line in pixels where it sets none. */
export const ROUTE_LINE_WIDTH = 4;

/**
 * A named place (a GPX waypoint). It is none of a route's points, but belongs to a route
 * entry all the same: exported with it, shown in its view, and deleted with it.
 */
export interface Waypoint {
  id: string;
  /** The route it belongs to: the one being drawn when it was placed. */
  routeId: string;
  lngLat: LngLat;
  name: string;
  description?: string;
  /** Shown in the pin in place of its dot. */
  icon?: MapIcon;
}

/** What the route tool draws, keeps and exports. */
export interface RouteData {
  routes: Route[];
  waypoints: Waypoint[];
}
