import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { createEffect, onCleanup } from 'solid-js';
import { roundLngLat } from '../routing/legs';
import { editingRouteId, menu, reach, setMenu, setTool, setWaypointDraft, stopDrawing, tool } from '../state/drawing';
import { appendPoint, redo, undo } from '../state/routes';
import { fromMarker } from './markers';
import { insertPointOnLine } from './routeTools';
import { TapFilter, type PointerSample } from './tapFilter';

/** Taps on the map and keys while a route is drawn. */
export function Interactions(props: { map: MapLibreMap }) {
  const map = props.map;

  // What the next tap does, for the cursor over the map and for the markers (styles.css).
  createEffect(() => {
    if (editingRouteId()) map.getContainer().dataset.tool = tool();
    else delete map.getContainer().dataset.tool;
  });

  // MapLibre turns a touch held for 500 ms into a contextmenu event. The browser may still
  // send a click when that finger lifts; it must neither close the menu nor add a point.
  // A press that closes an open menu only closes it: its click adds no route point.
  let pointerType = 'mouse';
  let swallowClick = false;
  // Clicks that come with dragging the map are no taps (a mouse button that bounces, a
  // browser's click after a touch pan): every tap waits a moment first.
  const taps = new TapFilter();
  const sample = (e: MouseEvent): PointerSample => ({ x: e.clientX, y: e.clientY, t: e.timeStamp, touch: pointerType !== 'mouse' });
  const onPointerDown = (e: PointerEvent) => {
    pointerType = e.pointerType;
    swallowClick = menu() !== undefined && !(e.target instanceof Element && e.target.closest('.context-menu'));
    if (e.isPrimary) taps.down(sample(e));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.isPrimary) taps.move(sample(e));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.isPrimary) taps.up(sample(e));
  };

  const onContextMenu = () => {
    if (pointerType !== 'mouse') swallowClick = true;
  };
  const onClick = (e: MapMouseEvent) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (editingRouteId()) taps.click(sample(e.originalEvent), () => onTap(e));
  };
  /** A click that proved to be a tap: the current tool acts on the route being drawn. */
  const onTap = (e: MapMouseEvent) => {
    const routeId = editingRouteId();
    if (!routeId || fromMarker(e.originalEvent)) return;
    setMenu(undefined);
    const { lng, lat } = e.lngLat.wrap();
    const t = tool();
    if (t === 'insert') insertPointOnLine(map, routeId, [e.point.x, e.point.y], pointerType === 'mouse' ? 10 : 24);
    else if (t === 'waypoint') setWaypointDraft({ lngLat: roundLngLat([lng, lat]), name: '', description: '' });
    else if (t === 'append') appendPoint(routeId, roundLngLat([lng, lat]), reach() === 'line');
  };
  const onMoveStart = () => setMenu(undefined);
  // A tap made before a key comes first, so that Esc or Undo act on it, here or in a dialog.
  const onKeyDownFirst = () => taps.flush();
  const onKeyDown = (e: KeyboardEvent) => {
    // Keys a dialog has handled are done; text fields keep their own undo and Escape handling,
    // and an open modal dialog has the keyboard to itself (its Esc closes only the dialog).
    if (!editingRouteId() || e.defaultPrevented || isTextField(e.target) || document.querySelector('dialog:modal')) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault();
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

  // On the window, so it runs before the menu closes itself on the same press.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  map.on('contextmenu', onContextMenu);
  map.on('click', onClick);
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
