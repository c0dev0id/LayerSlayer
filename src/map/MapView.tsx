import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createEffect, createMemo, on, onCleanup, onMount, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { describeLoadError, requestUrl } from '../state/net';
import { setView, state } from '../state/store';
import { clearLayerError, reportLayerError, setMap, setZoom } from '../state/ui';
import { assets } from './assets';
import { watchGeoJsonBounds } from './bounds';
import { CACHED_SCHEMES, composeStyle, FEATURE_PROTOCOL, WMTS_PROTOCOL } from './compose';
import { loadCachedTile, loadTile } from './protocols';
import { routeLines, ROUTES_SOURCE, withRoutes } from './routeOverlay';

maplibregl.setWorkerUrl(workerUrl);
maplibregl.addProtocol(FEATURE_PROTOCOL, loadTile);
maplibregl.addProtocol(WMTS_PROTOCOL, loadTile);
for (const scheme of CACHED_SCHEMES) maplibregl.addProtocol(scheme, loadCachedTile);

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * The user layer a MapLibre source belongs to: its id, or the part before the first
 * slash. None for the map's own sources, such as the route lines.
 */
function layerOf(sourceId: string | undefined): string | undefined {
  const id = sourceId?.split('/')[0];
  return state.layers.some((l) => l.id === id) ? id : undefined;
}

export function MapView() {
  let container!: HTMLDivElement;

  onMount(() => {
    const { center, zoom, bearing, pitch } = unwrap(state.view);
    const map = new maplibregl.Map({
      container,
      style: { version: 8, sources: {}, layers: [] },
      center,
      zoom,
      bearing,
      pitch,
      attributionControl: { compact: true },
      transformRequest: (url) => ({ url: requestUrl(url) }),
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 15 } }), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    setZoom(map.getZoom());
    map.on('zoom', () => setZoom(map.getZoom()));
    map.on('moveend', () => {
      const c = map.getCenter();
      setView({
        center: [round(c.lng, 6), round(c.lat, 6)],
        zoom: round(map.getZoom(), 3),
        bearing: round(map.getBearing(), 2),
        pitch: round(map.getPitch(), 2),
      });
    });
    map.on('error', (event: maplibregl.ErrorEvent & { sourceId?: string }) => {
      const id = layerOf(event.sourceId);
      if (id) void describeLoadError(event.error).then((message) => reportLayerError(id, message));
      else console.error(event.error);
    });
    watchGeoJsonBounds(map);
    map.on('sourcedata', (event) => {
      const id = layerOf(event.sourceId);
      if (id && event.tile) clearLayerError(id);
    });

    map.once('load', () => {
      setMap(map);
      // Composing reads every layer setting, so any change recomposes. The style goes to
      // MapLibre as plain data: store proxies cannot be sent to its workers.
      const layers = createMemo(() => JSON.parse(JSON.stringify(composeStyle(state.layers, assets()))));
      // A layer change carries the route lines as they are; a route change only replaces their data.
      createEffect(() => map.setStyle(withRoutes(layers(), untrack(routeLines)), { diff: true }));
      createEffect(
        on(routeLines, (lines) => map.getSource<maplibregl.GeoJSONSource>(ROUTES_SOURCE)?.setData(lines), { defer: true }),
      );
    });
    onCleanup(() => {
      setMap(undefined);
      map.remove();
    });
  });

  return <div ref={container} class="map" />;
}
