import { createSignal } from 'solid-js';
import { keepStored, readStored } from '../state/persist';

/**
 * The width of the side panel, which the handle on its edge changes: dragged, or with the
 * arrow keys, and back to the default with a double click. The width is this browser's
 * convenience, kept in local storage rather than in projects.
 */

const STORAGE_KEY = 'layerslayer-panel-width';
export const DEFAULT_PANEL_WIDTH = 320;
const MIN_WIDTH = 260;
const MAX_WIDTH = 720;
/** Room the map keeps beside the panel. */
const MAP_MIN_WIDTH = 320;

/** The width within bounds, leaving the map room in this window. */
export function panelWidthWithin(width: number, windowWidth: number): number {
  return Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, windowWidth - MAP_MIN_WIDTH, width)));
}

const stored = Number(readStored(STORAGE_KEY));
const [panelWidth, setWidth] = createSignal(stored > 0 ? stored : DEFAULT_PANEL_WIDTH);
export { panelWidth };

function setPanelWidth(width: number, keep: boolean): void {
  setWidth(panelWidthWithin(width, window.innerWidth));
  if (keep) keepStored(STORAGE_KEY, String(panelWidth()));
}

/** The handle on the panel's edge. */
export function PanelResizer() {
  return (
    <div
      class="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Panel width"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={panelWidth()}
      tabindex="0"
      title="Drag to make the panel wider or narrower; double-click for its usual width"
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => setPanelWidth(ev.clientX, false);
        const end = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', end);
          handle.removeEventListener('pointercancel', end);
          setPanelWidth(panelWidth(), true);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
      }}
      onDblClick={() => setPanelWidth(DEFAULT_PANEL_WIDTH, true)}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0;
        if (!step) return;
        e.preventDefault();
        setPanelWidth(panelWidth() + step, true);
      }}
    />
  );
}
