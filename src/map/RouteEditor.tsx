import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, createMemo, For, onCleanup, Show, type Accessor } from 'solid-js';
import { roundLngLat } from '../routing/legs';
import { editingRouteId, tool } from '../state/drawing';
import { movePoint, removePoint, routeById } from '../state/routes';
import { MarkerHandle, onMarkerMenu } from './markers';

/** Draggable markers for the points of the route being drawn. */
export function RouteEditor(props: { map: MapLibreMap }) {
  return (
    <Show when={editingRouteId()} keyed>
      {(routeId) => {
        const route = createMemo(() => routeById(routeId));
        return (
          <For each={route()?.points.map((p) => p.id)}>
            {(pointId, index) => <PointMarker map={props.map} routeId={routeId} pointId={pointId} index={index} />}
          </For>
        );
      }}
    </Show>
  );
}

function PointMarker(props: { map: MapLibreMap; routeId: string; pointId: string; index: Accessor<number> }) {
  const { map, routeId, pointId, index } = props;
  const route = createMemo(() => routeById(routeId));

  const content = (
    <div class="route-point" style={{ 'background-color': route()?.color }}>
      {index() + 1}
    </div>
  ) as HTMLElement;
  const handle = new MarkerHandle(map, content, { className: 'route-point-marker' });
  createEffect(() => {
    const p = route()?.points[index()];
    handle.setPosition(p && [p.lngLat[0], p.lngLat[1]]);
  });
  handle.marker.on('dragend', () => {
    const { lng, lat } = handle.marker.getLngLat().wrap();
    movePoint(routeId, pointId, roundLngLat([lng, lat]));
  });
  handle.root.addEventListener('click', () => {
    if (tool() === 'delete') removePoint(routeId, pointId);
  });
  const stopMenu = onMarkerMenu(handle, map, () => [{ label: 'Remove point', run: () => removePoint(routeId, pointId) }]);
  onCleanup(() => {
    stopMenu();
    handle.remove();
  });
  return null;
}
