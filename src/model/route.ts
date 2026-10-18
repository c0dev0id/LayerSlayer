import type { MapIcon } from './icon';
import { MAX_LABEL_SIZE, MIN_LABEL_SIZE } from './label';
import { isHexColor, within } from './stored';
import type { WaypointType } from './waypointType';

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
  /** Colour of the outline along both sides of the route's line, and its width on each side in pixels; ROUTE_OUTLINE where unset. */
  outlineColor?: string;
  outlineWidth?: number;
  /** Colour of the route's waypoint pins; WAYPOINT_COLOR where unset. */
  waypointColor?: string;
  /** Colour and size in pixels of the waypoints' names, and colour of the box behind them; the panel's own where unset. */
  waypointTextColor?: string;
  waypointTextSize?: number;
  waypointBoxColor?: string;
}

/** Width of a route's line in pixels where it sets none. */
export const ROUTE_LINE_WIDTH = 4;

/** A white outline, 1.5 px on each side of the line, that keeps a route readable on any map. */
export const ROUTE_OUTLINE = { color: '#ffffff', width: 1.5 };
export const MAX_ROUTE_OUTLINE_WIDTH = 4;

/** The route's outline, within bounds whatever a project file says. */
export function routeOutline(route: Pick<Route, 'outlineColor' | 'outlineWidth'>): { color: string; width: number } {
  return {
    color: isHexColor(route.outlineColor) ? route.outlineColor : ROUTE_OUTLINE.color,
    width: within(route.outlineWidth, 0, MAX_ROUTE_OUTLINE_WIDTH, ROUTE_OUTLINE.width),
  };
}

export const WAYPOINT_COLOR = '#c92a2a';
export const WAYPOINT_TEXT_SIZE = 12;

/** How a route's waypoints look; the name's colours are left out where unset, so that they follow the panel's theme. */
export function waypointLook(route: Partial<Pick<Route, 'waypointColor' | 'waypointTextColor' | 'waypointTextSize' | 'waypointBoxColor'>> = {}): {
  pin: string;
  text?: string;
  size: number;
  box?: string;
} {
  return {
    pin: isHexColor(route.waypointColor) ? route.waypointColor : WAYPOINT_COLOR,
    ...(isHexColor(route.waypointTextColor) && { text: route.waypointTextColor }),
    size: within(route.waypointTextSize, MIN_LABEL_SIZE, MAX_LABEL_SIZE, WAYPOINT_TEXT_SIZE),
    ...(isHexColor(route.waypointBoxColor) && { box: route.waypointBoxColor }),
  };
}

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
  /** What it marks, drawn as the type's own shape standing on the map; a pin where unset. */
  type?: WaypointType;
  /** Shown in the pin in place of its dot, where the waypoint has no type. */
  icon?: MapIcon;
}

/** What the route tool draws, keeps and exports. */
export interface RouteData {
  routes: Route[];
  waypoints: Waypoint[];
}
