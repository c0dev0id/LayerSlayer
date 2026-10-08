/** A position as longitude and latitude in degrees. */
export type LngLat = [number, number];

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
}

/** A named place of its own (a GPX waypoint), independent of the routes. */
export interface Waypoint {
  id: string;
  lngLat: LngLat;
  name: string;
  description?: string;
}

/** What the route tool draws, keeps and exports. */
export interface RouteData {
  routes: Route[];
  waypoints: Waypoint[];
}
