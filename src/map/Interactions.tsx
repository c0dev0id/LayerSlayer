import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { createEffect, onCleanup } from 'solid-js';
import type { LngLat } from '../model/route';
import { roundLngLat } from '../routing/legs';
import {
  addFocusCorner,
  closeFocusArea,
  editingRouteId,
  focusDraft,
  menu,
  reach,
  removeLastFocusCorner,
  setFocusCursor,
  setMenu,
  setTool,
  setWaypointDraft,
  stopDrawing,
  stopFocusDrawing,
  tool,
} from '../state/drawing';
import { appendPoint, redo, undo } from '../state/routes';
import { fromMarker } from './markers';
import { googleMapsUrl, latLonText, streetViewUrl } from './placeLinks';
import { insertPointOnLine } from './routeTools';
import { TapFilter, type PointerSample } from './tapFilter';

/**
 * Taps on the map and keys while a route or the focus area is drawn, and the menu of a spot
 * on the map (right-click or long press): its coordinates, Google Maps and Street View.
 */
export function Interactions(props: { map: MapLibreMap }) {
  const map = props.map;

  // What the next tap does, for the cursor over the map and for the markers (styles.css).
  createEffect(() => {
    const container = map.getContainer();
    if (editingRouteId()) container.dataset.tool = tool();
    else if (focusDraft()) container.dataset.tool = 'focus';
    else delete container.dataset.tool;
  });

  // MapLibre turns a touch held for 500 ms into a contextmenu event. The browser may still
  // send a click when that finger lifts; it must neither close the menu nor add a point.
  // A press that closes an open menu only closes it: its click adds no route point.
  let pointerType = 'mouse';
  let swallowClick = false;
  /** Where the right mouse button went down; a press that moved from there turned the map. */
  let rightDown: { x: number; y: number } | undefined;
  // Clicks that come with dragging the map are no taps (a mouse button that bounces, a
  // browser's click after a touch pan): every tap waits a moment first.
  const taps = new TapFilter();
  /** How near a tap must be to what it acts on (a route line, a first corner), in CSS pixels. */
  const tapRadius = () => (pointerType === 'mouse' ? 10 : 24);
  const sample = (e: MouseEvent): PointerSample => ({ x: e.clientX, y: e.clientY, t: e.timeStamp, touch: pointerType !== 'mouse' });
  const onPointerDown = (e: PointerEvent) => {
    pointerType = e.pointerType;
    if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
    swallowClick = menu() !== undefined && !(e.target instanceof Element && e.target.closest('.context-menu'));
    if (e.isPrimary) taps.down(sample(e));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.isPrimary) taps.move(sample(e));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.isPrimary) taps.up(sample(e));
  };

  const onContextMenu = (e: MapMouseEvent) => {
    const touch = pointerType !== 'mouse';
    if (touch) swallowClick = true;
    // Route points and waypoints open their own menus.
    if (fromMarker(e.originalEvent)) return;
    // Windows sends the contextmenu event when the button comes up, also after turning the map.
    const { clientX, clientY } = e.originalEvent;
    if (!touch && rightDown && Math.hypot(clientX - rightDown.x, clientY - rightDown.y) > 5) return;
    const { lng, lat } = e.lngLat.wrap();
    const spot: LngLat = [lng, lat];
    setMenu({
      x: e.point.x,
      y: e.point.y,
      touch,
      items: [
        { label: 'Copy coordinates', run: () => void navigator.clipboard?.writeText(latLonText(spot)).catch(() => {}) },
        { label: 'Open Google Maps', run: () => window.open(googleMapsUrl(spot), '_blank', 'noopener') },
        { label: 'Open Street View', run: () => window.open(streetViewUrl(spot), '_blank', 'noopener') },
      ],
    });
  };
  const onClick = (e: MapMouseEvent) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (editingRouteId() || focusDraft()) taps.click(sample(e.originalEvent), () => onTap(e));
  };
  /** A click that proved to be a tap: the current tool acts on the route being drawn, or a corner is placed. */
  const onTap = (e: MapMouseEvent) => {
    if (focusDraft()) return onFocusTap(e);
    const routeId = editingRouteId();
    if (!routeId || fromMarker(e.originalEvent)) return;
    setMenu(undefined);
    const { lng, lat } = e.lngLat.wrap();
    const t = tool();
    if (t === 'insert') insertPointOnLine(map, routeId, [e.point.x, e.point.y], tapRadius());
    else if (t === 'waypoint') setWaypointDraft({ lngLat: roundLngLat([lng, lat]), name: '', description: '' });
    else if (t === 'append') appendPoint(routeId, roundLngLat([lng, lat]), reach() === 'line');
  };
  /** A tap on the first corner closes the focus area; anywhere else it adds a corner. */
  const onFocusTap = (e: MapMouseEvent) => {
    const corners = focusDraft();
    if (!corners || fromMarker(e.originalEvent)) return;
    const first = corners[0];
    if (corners.length >= 3 && first && map.project(first).dist(e.point) <= tapRadius()) closeFocusArea();
    else {
      const { lng, lat } = e.lngLat.wrap();
      addFocusCorner(roundLngLat([lng, lat]));
    }
  };
  const onMouseMove = (e: MapMouseEvent) => {
    // Before the first corner there is no line to the pointer.
    if (!focusDraft()?.length) return;
    const { lng, lat } = e.lngLat.wrap();
    setFocusCursor([lng, lat]);
  };
  const onMouseOut = () => setFocusCursor(undefined);
  const onMoveStart = () => setMenu(undefined);
  // A tap made before a key comes first, so that Esc or Undo act on it, here or in a dialog.
  const onKeyDownFirst = () => taps.flush();
  const onKeyDown = (e: KeyboardEvent) => {
    // Keys a dialog has handled are done; text fields keep their own undo and Escape handling,
    // and an open modal dialog has the keyboard to itself (its Esc closes only the dialog).
    if (e.defaultPrevented || isTextField(e.target) || document.querySelector('dialog:modal')) return;
    if (focusDraft()) return onFocusKey(e);
    if (!editingRouteId()) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault();
      // An open menu may name a point the step takes away.
      setMenu(undefined);
      if (key === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.key !== 'Escape') return;
    if (menu()) setMenu(undefined);
    // The other route tools fall back to appending; Esc while appending ends drawing.
    else if (tool() !== 'append') setTool('append');
    else stopDrawing();
  };

  /** Backspace takes the last corner of the focus area back, Esc stops drawing it. */
  const onFocusKey = (e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      removeLastFocusCorner();
    } else if (e.key === 'Escape') stopFocusDrawing();
  };

  // On the window, so it runs before the menu closes itself on the same press.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  map.on('contextmenu', onContextMenu);
  map.on('click', onClick);
  map.on('mousemove', onMouseMove);
  map.on('mouseout', onMouseOut);
  map.on('movestart', onMoveStart);
  window.addEventListener('keydown', onKeyDownFirst, true);
  document.addEventListener('keydown', onKeyDown);
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDownFirst, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
    map.off('contextmenu', onContextMenu);
    map.off('click', onClick);
    map.off('mousemove', onMouseMove);
    map.off('mouseout', onMouseOut);
    map.off('movestart', onMoveStart);
    document.removeEventListener('keydown', onKeyDown);
  });
  return null;
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'reset', 'color']);

function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}
