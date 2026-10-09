import { createSignal } from 'solid-js';
import { reconcile, unwrap } from 'solid-js/store';
import { isLngLat, PROFILES, type LngLat, type Profile, type Route, type RouteData, type Waypoint } from '../model/route';
import * as edit from '../routing/routeEdit';
import { History } from './history';
import { persistedStore } from './persist';

/**
 * Routes and waypoints of the route tool, kept in the browser apart from the layers. All
 * writes go through the actions below; results of pure edits are applied with `reconcile`
 * (a plain object set merges and would keep stale keys).
 */

const STORAGE_KEY = 'layerslayer-routes';

function isRoute(value: unknown): value is Route {
  const r = value as Route;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    PROFILES.some((p) => p.value === r.profile) &&
    typeof r.color === 'string' &&
    Array.isArray(r.points) &&
    r.points.every((p) => typeof p?.id === 'string' && isLngLat(p.lngLat)) &&
    typeof r.legs === 'object' &&
    r.legs !== null &&
    (r.lineWidth === undefined || (typeof r.lineWidth === 'number' && Number.isFinite(r.lineWidth)))
  );
}

function isWaypoint(value: unknown): value is Waypoint {
  const w = value as Waypoint;
  return (
    typeof w === 'object' &&
    w !== null &&
    typeof w.id === 'string' &&
    typeof w.routeId === 'string' &&
    typeof w.name === 'string' &&
    isLngLat(w.lngLat)
  );
}

/**
 * Reads stored routes; entries without the current shape are dropped one by one, as are
 * waypoints whose route is not among them.
 */
export function parseRouteData(json: string): RouteData {
  const stored = JSON.parse(json) as Partial<RouteData>;
  const routes = Array.isArray(stored.routes) ? stored.routes.filter(isRoute) : [];
  const ids = new Set(routes.map((r) => r.id));
  const waypoints = Array.isArray(stored.waypoints) ? stored.waypoints.filter((w) => isWaypoint(w) && ids.has(w.routeId)) : [];
  return { routes, waypoints };
}

const [routeData, setRouteData] = persistedStore<RouteData>(STORAGE_KEY, 'routes', parseRouteData, () => ({ routes: [], waypoints: [] }));
export { routeData };

/** Undo history of route and waypoint edits; routing results are not recorded. */
const history = new History<RouteData>();
const [historyVersion, setHistoryVersion] = createSignal(0);

const snapshot = (): RouteData => structuredClone(unwrap(routeData));

/** Records the current routes as an undo step; call right before an edit. Edits of one `gesture` make one step. */
function recordEdit(label: string, gesture?: string): void {
  if (history.continues(gesture)) return;
  history.record(snapshot(), label, gesture);
  setHistoryVersion((v) => v + 1);
}

/** Ends a gesture, such as a slider let go: its next edit is an undo step of its own. */
export function endGesture(): void {
  history.endGesture();
}

/** Label of the edit that undo would revert (reactive). */
export function undoLabel(): string | undefined {
  historyVersion();
  return history.undoLabel;
}

/** Label of the edit that redo would repeat (reactive). */
export function redoLabel(): string | undefined {
  historyVersion();
  return history.redoLabel;
}

export function undo(): void {
  restore(history.undo(snapshot()));
}

export function redo(): void {
  restore(history.redo(snapshot()));
}

function restore(state: RouteData | undefined): void {
  if (!state) return;
  setRouteData(reconcile(state, { key: 'id', merge: false }));
  setHistoryVersion((v) => v + 1);
}

export function routeById(id: string | undefined): Route | undefined {
  return id === undefined ? undefined : routeData.routes.find((r) => r.id === id);
}

export function addRoute(route: Route): void {
  recordEdit('Draw route');
  setRouteData('routes', (routes) => [...routes, route]);
}

/** The waypoints that belong to a route. */
export function routeWaypoints(id: string): Waypoint[] {
  return routeData.waypoints.filter((w) => w.routeId === id);
}

/** Deletes a route and its waypoints, as one step. */
export function removeRoute(id: string): void {
  if (!routeById(id)) return;
  recordEdit('Delete route');
  setRouteData('routes', (routes) => routes.filter((r) => r.id !== id));
  setRouteData('waypoints', (list) => list.filter((w) => w.routeId !== id));
}

/** Sets a property of a route as an undo step; with `gesture`, the values set until the gesture ends make one step. */
function setRouteProperty<K extends 'name' | 'color' | 'waypointSize' | 'lineWidth'>(id: string, key: K, value: Route[K], label: string, gesture = false): void {
  const index = routeData.routes.findIndex((r) => r.id === id);
  if (index < 0 || routeData.routes[index]![key] === value) return;
  recordEdit(label, gesture ? `${key} ${id}` : undefined);
  setRouteData('routes', index, { [key]: value } as Partial<Route>);
}

export function renameRoute(id: string, name: string): void {
  setRouteProperty(id, 'name', name, 'Rename route');
}

/** Sets a route's colour; the colours picked while the picker is open make one undo step. */
export function setRouteColor(id: string, color: string): void {
  setRouteProperty(id, 'color', color, 'Change route colour', true);
}

/** Sets how large a route's waypoints are drawn; dragging the slider makes one undo step. */
export function setWaypointSize(id: string, size: number): void {
  setRouteProperty(id, 'waypointSize', size, 'Change waypoint size', true);
}

/** Sets the width of a route's line; dragging the slider makes one undo step. */
export function setRouteLineWidth(id: string, width: number): void {
  setRouteProperty(id, 'lineWidth', width, 'Change line width', true);
}

/**
 * Applies a pure edit to a route; reconciling by id keeps unchanged points' identity.
 * Edits with a label are undo steps; routing results come without one.
 */
function updateRoute(id: string, change: (route: Route) => Route, label?: string): void {
  const index = routeData.routes.findIndex((r) => r.id === id);
  if (index < 0) return;
  const current = unwrap(routeData.routes[index]!);
  const next = change(current);
  if (next === current) return;
  if (label) recordEdit(label);
  setRouteData('routes', index, reconcile(next, { key: 'id', merge: false }));
}


export function setRouteProfile(id: string, profile: Profile): void {
  updateRoute(id, (r) => (r.profile === profile ? r : edit.changeProfile(r, profile)), 'Change routing profile');
}

/** Adds a point at the end of a route, reached by routing or, if `straight`, by a straight line. */
export function appendPoint(routeId: string, lngLat: LngLat, straight = false): void {
  const point = { id: crypto.randomUUID(), lngLat, ...(straight ? { straight } : {}) };
  updateRoute(routeId, (r) => edit.appendPoint(r, point), 'Add point');
}

/** Inserts a route point before the one at `index`. */
export function insertPoint(routeId: string, index: number, lngLat: LngLat): void {
  updateRoute(routeId, (r) => edit.insertPoint(r, index, { id: crypto.randomUUID(), lngLat }), 'Insert point');
}

export function movePoint(routeId: string, pointId: string, lngLat: LngLat): void {
  updateRoute(routeId, (r) => edit.movePoint(r, pointId, lngLat), 'Move point');
}

export function removePoint(routeId: string, pointId: string): void {
  updateRoute(routeId, (r) => edit.removePoint(r, pointId), 'Remove point');
}

export function setRouteLeg(routeId: string, key: string, geometry: string): void {
  updateRoute(routeId, (r) => edit.addLeg(r, key, geometry));
}

export function addWaypoint(waypoint: Waypoint): void {
  recordEdit('Add waypoint');
  setRouteData('waypoints', (list) => [...list, waypoint]);
}

/** Changes a waypoint's position, name, description or icon; an empty description or icon is dropped. */
export function updateWaypoint(id: string, change: Partial<Omit<Waypoint, 'id'>>, label: string): void {
  const index = routeData.waypoints.findIndex((w) => w.id === id);
  if (index < 0) return;
  const next: Waypoint = { ...unwrap(routeData.waypoints[index]!), ...change };
  if (!next.description) delete next.description;
  if (!next.icon) delete next.icon;
  recordEdit(label);
  setRouteData('waypoints', index, reconcile(next, { merge: false }));
}

export function removeWaypoint(id: string): void {
  if (!routeData.waypoints.some((w) => w.id === id)) return;
  recordEdit('Delete waypoint');
  setRouteData('waypoints', (list) => list.filter((w) => w.id !== id));
}

/** Replaces all routes and waypoints, as when a project is opened; nothing before it can be undone. */
export function replaceRouteData(data: RouteData): void {
  history.clear();
  restore(data);
}

/** Adds routes and waypoints read from a file, as one undo step. */
export function importRouteData(data: RouteData, label: string): void {
  if (data.routes.length === 0 && data.waypoints.length === 0) return;
  recordEdit(label);
  setRouteData('routes', (routes) => [...routes, ...data.routes]);
  setRouteData('waypoints', (list) => [...list, ...data.waypoints]);
}
