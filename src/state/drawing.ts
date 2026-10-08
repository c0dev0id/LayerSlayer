import { createEffect, createRoot, createSignal } from 'solid-js';
import type { LngLat } from '../model/route';
import { routeById } from './routes';
import { setFocus } from './store';

/**
 * Transient state of drawing on the map; never kept. A route is being drawn while
 * `editingRouteId` is set, the focus area while `focusDraft` is. One excludes the other.
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
  stopFocusDrawing();
  setMenu(undefined);
  setEditingRouteId(routeId);
  setTool('append');
  setReach('route');
}

export function stopDrawing(): void {
  setMenu(undefined);
  setEditingRouteId(undefined);
}

/** The corners of the focus area being drawn, in order; none while it is not drawn. */
export const [focusDraft, setFocusDraft] = createSignal<LngLat[]>();

/** Where the mouse is while the focus area is drawn, for the line on to the next corner. */
export const [focusCursor, setFocusCursor] = createSignal<LngLat>();

/** Starts drawing a focus area; the current one stays until the new one is closed. */
export function startFocusDrawing(): void {
  stopDrawing();
  setFocusDraft([]);
}

export function stopFocusDrawing(): void {
  setFocusDraft(undefined);
  setFocusCursor(undefined);
}

export function addFocusCorner(lngLat: LngLat): void {
  setFocusDraft((corners) => corners && [...corners, lngLat]);
}

export function removeLastFocusCorner(): void {
  setFocusDraft((corners) => corners?.slice(0, -1));
}

/** Makes the drawn corners the focus area, once there are enough for one. */
export function closeFocusArea(): void {
  const corners = focusDraft();
  if (!corners || corners.length < 3) return;
  setFocus(corners);
  stopFocusDrawing();
}

// Drawing ends when its route goes, however it goes: deleted, undone or replaced.
createRoot(() => {
  createEffect(() => {
    const id = editingRouteId();
    if (id && !routeById(id)) stopDrawing();
  });
});
