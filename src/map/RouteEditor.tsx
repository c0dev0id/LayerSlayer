import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, createMemo, For, onCleanup } from 'solid-js';
import { roundLngLat } from '../routing/legs';
import { editingRouteId, tool } from '../state/drawing';
import { movePoint, removePoint, routeById } from '../state/routes';
import { MarkerHandle, onMarkerMenu, openMenuAt } from './markers';

/** Draggable markers for the points of the route being drawn. */
export function RouteEditor(props: { map: MapLibreMap }) {
  const keys = createMemo(
    () => {
      const id = editingRouteId();
      return routeById(id)?.points.map((p) => `${id}/${p.id}`) ?? [];
    },
    [],
    { equals: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );
  return (
    <For each={keys()}>
      {(key) => {
        const [routeId, pointId] = key.split('/') as [string, string];
        return <PointMarker map={props.map} routeId={routeId} pointId={pointId} />;
      }}
    </For>
  );
}

function PointMarker(props: { map: MapLibreMap; routeId: string; pointId: string }) {
  const { map, routeId, pointId } = props;
  const route = createMemo(() => routeById(routeId));
  const index = () => route()?.points.findIndex((p) => p.id === pointId) ?? -1;

  const content = (
    <div class="route-point" style={{ 'background-color': route()?.color }}>
      {index() + 1}
    </div>
  ) as HTMLElement;
  const handle = new MarkerHandle(map, content, { className: 'route-point-marker', draggable: true });
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
  const stopMenu = onMarkerMenu(handle, (x, y, touch) =>
    openMenuAt(map, x, y, touch, [{ label: 'Remove point', run: () => removePoint(routeId, pointId) }]),
  );
  onCleanup(() => {
    stopMenu();
    handle.remove();
  });
  return null;
}
