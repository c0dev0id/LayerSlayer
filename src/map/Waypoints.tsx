import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, For, onCleanup } from 'solid-js';
import { roundLngLat } from '../routing/legs';
import { editingRouteId, setWaypointDraft, tool } from '../state/drawing';
import { iconSize } from '../model/icon';
import { removeWaypoint, routeById, routeData, updateWaypoint } from '../state/routes';
import { PIN_HEIGHT, WaypointPin } from '../ui/icons';
import { MarkerHandle, onMarkerMenu } from './markers';

/**
 * Waypoints: always shown as a pin with the name. While their route is drawn they can be
 * dragged, edited or deleted, like its points; otherwise they let clicks through to the map.
 */
export function Waypoints(props: { map: MapLibreMap }) {
  return <For each={routeData.waypoints.map((w) => w.id)}>{(id) => <WaypointMarker map={props.map} id={id} />}</For>;
}

function WaypointMarker(props: { map: MapLibreMap; id: string }) {
  const { map, id } = props;
  const waypoint = () => routeData.waypoints.find((w) => w.id === id);
  const editable = () => editingRouteId() !== undefined && editingRouteId() === waypoint()?.routeId;
  const scale = () => iconSize(routeById(waypoint()?.routeId)?.waypointSize);

  // The name sits level with the middle of the pin's head, 11 of its 28 units down.
  const content = (
    <div class="waypoint" title={waypoint()?.description ?? ''}>
      <WaypointPin icon={waypoint()?.icon} scale={scale()} />
      <span class="waypoint-name" style={{ top: `${(PIN_HEIGHT * scale() * 11) / 28}px` }}>
        {waypoint()?.name}
      </span>
    </div>
  ) as HTMLElement;
  const handle = new MarkerHandle(map, content, { className: 'waypoint-marker', anchor: 'bottom' });
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
  const stopMenu = onMarkerMenu(handle, map, () => {
    const w = waypoint();
    if (!editable() || !w) return undefined;
    return [
      {
        label: 'Edit waypoint…',
        run: () =>
          setWaypointDraft({ id, routeId: w.routeId, lngLat: w.lngLat, name: w.name, description: w.description ?? '', ...(w.icon && { icon: w.icon }) }),
      },
      { label: 'Delete waypoint', run: () => removeWaypoint(id) },
    ];
  });
  onCleanup(() => {
    stopMenu();
    handle.remove();
  });
  return null;
}
