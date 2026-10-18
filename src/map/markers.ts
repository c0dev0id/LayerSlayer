import * as maplibregl from 'maplibre-gl';
import type { LngLat } from '../model/route';
import { setMenu, type MenuItem } from '../state/drawing';
import { onLongPress } from './longPress';

/** True if a DOM event originated from a marker (the map's click fires after the marker's). */
/** The colour of the pins that mark a place: one found by search, one a link opens. */
export const PIN_COLOR = '#e03131';

export function fromMarker(event: Event | undefined): boolean {
  return event?.target instanceof Element && event.target.closest('.maplibregl-marker') !== null;
}

/** The map events on which MapLibre places a marker on screen again (Marker.addTo). */
const PLACING_EVENTS = ['move', 'moveend', 'terrain', 'projectiontransition', 'idle'] as const;

/**
 * A draggable marker whose root element is owned by MapLibre (it sets transform, opacity
 * and pointer-events); the given content is placed inside it. `onPlace` runs whenever the
 * marker is placed on screen: when it is shown or dragged, and when MapLibre moves it.
 */
export class MarkerHandle {
  readonly marker: maplibregl.Marker;
  readonly root: HTMLDivElement;
  private added = false;
  private readonly onPlace: (() => void) | undefined;

  constructor(
    private readonly map: maplibregl.Map,
    content: Node,
    options: { className: string; anchor?: maplibregl.PositionAnchor; onPlace?: () => void },
  ) {
    this.onPlace = options.onPlace;
    this.root = document.createElement('div');
    this.root.className = options.className;
    this.root.append(content);
    this.marker = new maplibregl.Marker({ element: this.root, draggable: true, anchor: options.anchor ?? 'center' });
    // MapLibre starts a marker drag with any button. A right-click opens a menu under the
    // pointer that receives the release, which MapLibre never sees: the marker would then
    // follow the mouse. Only the primary button may drag.
    this.root.addEventListener('mousedown', (e) => {
      if (e.button !== 0) e.stopPropagation();
    });
    if (this.onPlace) this.marker.on('drag', this.onPlace);
  }

  /** Shows the marker at a position, or hides it for undefined. */
  setPosition(position: LngLat | undefined): void {
    if (!position) {
      this.remove();
      return;
    }
    this.marker.setLngLat(position);
    if (!this.added) {
      this.marker.addTo(this.map);
      this.added = true;
      if (this.onPlace) for (const type of PLACING_EVENTS) this.map.on(type, this.onPlace);
    }
    this.onPlace?.();
  }

  remove(): void {
    this.marker.remove();
    if (this.added && this.onPlace) for (const type of PLACING_EVENTS) this.map.off(type, this.onPlace);
    this.added = false;
  }
}

/**
 * Opens the context menu with `items` from a draggable marker, which swallows the map's
 * own contextmenu event and long press: right-click for mice, a long press for touch and
 * pens. No items, no menu. Dragging the marker closes an open menu. Returns a function
 * that removes the listeners.
 */
export function onMarkerMenu(handle: MarkerHandle, map: maplibregl.Map, items: () => MenuItem[] | undefined): () => void {
  const root = handle.root;
  const open = (clientX: number, clientY: number, touch: boolean) => {
    const list = items();
    if (!list) return;
    const rect = map.getContainer().getBoundingClientRect();
    setMenu({ x: clientX - rect.left, y: clientY - rect.top, touch, items: list });
  };
  let pointerType = 'mouse';
  const onPointerDown = (e: PointerEvent) => {
    pointerType = e.pointerType;
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Android also fires contextmenu on a long press; that one comes from onLongPress.
    if (pointerType === 'mouse') open(e.clientX, e.clientY, false);
  };
  const onDragStart = () => setMenu(undefined);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('contextmenu', onContextMenu);
  handle.marker.on('dragstart', onDragStart);
  const stopLongPress = onLongPress(root, (x, y) => open(x, y, true));
  return () => {
    stopLongPress();
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('contextmenu', onContextMenu);
    handle.marker.off('dragstart', onDragStart);
  };
}
