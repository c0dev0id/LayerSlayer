import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, createMemo, For, onCleanup, Show } from 'solid-js';
import { roundLngLat } from '../routing/legs';
import { editingRouteId, setWaypointDraft, tool } from '../state/drawing';
import { iconSize } from '../model/icon';
import { waypointLook } from '../model/route';
import { isWaypointType } from '../model/waypointType';
import { removeWaypoint, routeById, routeData, updateWaypoint } from '../state/routes';
import { WaypointPin } from '../ui/icons';
import { WaypointShape } from '../ui/WaypointShape';
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
  const waypoint = createMemo(() => routeData.waypoints.find((w) => w.id === id));
  const editable = () => editingRouteId() !== undefined && editingRouteId() === waypoint()?.routeId;
  const route = () => routeById(waypoint()?.routeId);
  const scale = createMemo(() => iconSize(route()?.waypointSize));
  const look = createMemo(() => waypointLook(route()));
  const type = () => {
    const t = waypoint()?.type;
    return isWaypointType(t) ? t : undefined;
  };

  const content = (
    <div
      class="waypoint"
      classList={{ shape: type() !== undefined }}
      title={waypoint()?.description ?? ''}
      style={{ '--waypoint-text': look().text, '--waypoint-size': `${look().size}px`, '--waypoint-box': look().box }}
    >
      <Show when={type()} fallback={<WaypointPin icon={waypoint()?.icon} scale={scale()} color={look().pin} />}>
        {(type) => <WaypointShape type={type()} scale={scale()} />}
      </Show>
      <span class="waypoint-name">{waypoint()?.name}</span>
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
          setWaypointDraft({ id, lngLat: w.lngLat, name: w.name, description: w.description ?? '', ...(isWaypointType(w.type) && { type: w.type }), ...(w.icon && { icon: w.icon }) }),
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
