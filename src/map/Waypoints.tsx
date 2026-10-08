import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, createMemo, For, onCleanup } from 'solid-js';
import { roundLngLat } from '../routing/legs';
import { editingRouteId, setWaypointDraft, tool } from '../state/drawing';
import { removeWaypoint, routeData, updateWaypoint } from '../state/routes';
import { WaypointPin } from '../ui/icons';
import { MarkerHandle, onMarkerMenu, openMenuAt } from './markers';

/**
 * Waypoints: always shown as a pin with the name. While a route is drawn they can be
 * dragged, edited or deleted; otherwise they let clicks through to the map.
 */
export function Waypoints(props: { map: MapLibreMap }) {
  const ids = createMemo(
    () => routeData.waypoints.map((w) => w.id),
    [],
    { equals: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );
  return <For each={ids()}>{(id) => <WaypointMarker map={props.map} id={id} />}</For>;
}

function WaypointMarker(props: { map: MapLibreMap; id: string }) {
  const { map, id } = props;
  const waypoint = () => routeData.waypoints.find((w) => w.id === id);
  const editable = () => editingRouteId() !== undefined;

  const content = (
    <div class="waypoint" title={waypoint()?.description ?? ''}>
      <WaypointPin />
      <span class="waypoint-name">{waypoint()?.name}</span>
    </div>
  ) as HTMLElement;
  const handle = new MarkerHandle(map, content, { className: 'waypoint-marker', anchor: 'bottom', draggable: true });
  createEffect(() => {
    const w = waypoint();
    handle.setPosition(w && [w.lngLat[0], w.lngLat[1]]);
  });
  // Inline, since MapLibre sets pointer-events on a marker after dragging it.
  createEffect(() => {
    handle.marker.setDraggable(editable());
    handle.root.style.pointerEvents = editable() ? 'auto' : 'none';
  });
  handle.marker.on('dragend', () => {
    const { lng, lat } = handle.marker.getLngLat().wrap();
    updateWaypoint(id, { lngLat: roundLngLat([lng, lat]) }, 'Move waypoint');
  });
  handle.root.addEventListener('click', () => {
    if (editable() && tool() === 'delete') removeWaypoint(id);
  });
  const stopMenu = onMarkerMenu(handle, (x, y, touch) => {
    const w = waypoint();
    if (!editable() || !w) return;
    openMenuAt(map, x, y, touch, [
      {
        label: 'Edit waypoint…',
        run: () => setWaypointDraft({ id, lngLat: w.lngLat, name: w.name, description: w.description ?? '' }),
      },
      { label: 'Delete waypoint', run: () => removeWaypoint(id) },
    ]);
  });
  onCleanup(() => {
    stopMenu();
    handle.remove();
  });
  return null;
}
