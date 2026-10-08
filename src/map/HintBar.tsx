import { Show } from 'solid-js';
import { editingRouteId, focusDraft, reach, removeLastFocusCorner, stopDrawing, stopFocusDrawing, tool, type Tool } from '../state/drawing';
import { routeById } from '../state/routes';

const ROUTE_HINTS: Record<Tool, string> = {
  append: 'tap the map to add points at the end, drag points to move them.',
  insert: 'tap the route line to insert a point there.',
  waypoint: 'tap the map to place a waypoint; right-click or long-press one to edit it.',
  delete: 'tap a route point or a waypoint to delete it.',
};

/** Appending while new points are reached by a straight line. */
const LINE_HINT = 'tap the map to add points at the end, joined by straight lines; Route goes back to routing.';

/**
 * What the current tool does while a route is drawn, with the button that ends drawing;
 * or how the focus area is drawn.
 */
export function HintBar() {
  const hint = () => (tool() === 'append' && reach() === 'line' ? LINE_HINT : ROUTE_HINTS[tool()]);
  return (
    <>
      <Show when={routeById(editingRouteId())}>
        {(route) => (
          <div class="hint-bar">
            <span>
              <strong>{route().name}</strong>: {hint()}
            </span>
            <button class="primary" onClick={stopDrawing}>
              Done
            </button>
          </div>
        )}
      </Show>
      <Show when={focusDraft()}>
        {(corners) => (
          <div class="hint-bar">
            <span>
              <strong>Focus area</strong>: tap the map to place its corners, then the first corner to close it.
            </span>
            <button title="Take the last corner back (Backspace)" disabled={corners().length === 0} onClick={removeLastFocusCorner}>
              Undo
            </button>
            <button title="Stop drawing; the focus area stays as it was (Esc)" onClick={stopFocusDrawing}>
              Cancel
            </button>
          </div>
        )}
      </Show>
    </>
  );
}
