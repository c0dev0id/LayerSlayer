import { createSignal } from 'solid-js';
import type { LngLat } from '../model/route';

/**
 * Transient state of the route tool; never kept. A route is being drawn while
 * `editingRouteId` is set.
 */

/** Tools while a route is drawn: add at the end, insert on the line, place a waypoint, delete. */
export type Tool = 'append' | 'insert' | 'waypoint' | 'delete';

/**
 * How a point appended to the route is reached: by routing along the roads, or by a
 * straight line, for a way the routing does not know. Every drawing starts with routing.
 */
export type Reach = 'route' | 'line';

export const [editingRouteId, setEditingRouteId] = createSignal<string>();
export const [tool, setTool] = createSignal<Tool>('append');
export const [reach, setReach] = createSignal<Reach>('route');

export interface MenuItem {
  label: string;
  run: () => void;
}

/**
 * The open context menu, positioned in CSS pixels relative to the map container. A menu
 * opened by a long press (`touch`) ignores the lifting finger until it is tapped again.
 */
export const [menu, setMenu] = createSignal<{ x: number; y: number; touch: boolean; items: MenuItem[] }>();

/** A waypoint being created (no id) or edited in the waypoint dialog. */
export interface WaypointDraft {
  id?: string;
  lngLat: LngLat;
  name: string;
  description: string;
}

export const [waypointDraft, setWaypointDraft] = createSignal<WaypointDraft>();

/** Starts drawing a route: appending, reached by routing. */
export function startDrawing(routeId: string): void {
  setMenu(undefined);
  setEditingRouteId(routeId);
  setTool('append');
  setReach('route');
}

export function stopDrawing(): void {
  setMenu(undefined);
  setEditingRouteId(undefined);
  setTool('append');
}
