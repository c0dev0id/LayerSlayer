import { Show } from 'solid-js';
import { editingRouteId, reach, stopDrawing, tool, type Tool } from '../state/drawing';
import { routeById } from '../state/routes';

const ROUTE_HINTS: Record<Tool, string> = {
  append: 'tap the map to add points at the end, drag points to move them.',
  insert: 'tap the route line to insert a point there.',
  waypoint: 'tap the map to place a waypoint; right-click or long-press one to edit it.',
  delete: 'tap a route point or a waypoint to delete it.',
};

/** Appending while new points are reached by a straight line. */
const LINE_HINT = 'tap the map to add points at the end, joined by straight lines; Route goes back to routing.';

/** What the current tool does while a route is drawn, with the button that ends drawing. */
export function HintBar() {
  const hint = () => (tool() === 'append' && reach() === 'line' ? LINE_HINT : ROUTE_HINTS[tool()]);
  return (
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
  );
}
