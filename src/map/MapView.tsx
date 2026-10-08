import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createEffect, createMemo, on, onCleanup, onMount, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { describeLoadError, requestUrl } from '../state/net';
import { focusBounds, setTerrain, setView, state } from '../state/store';
import { clearLayerError, reportLayerError, setMap, setZoom } from '../state/ui';
import { assets } from './assets';
import { watchGeoJsonBounds } from './bounds';
import { CACHED_SCHEMES, COG_PROTOCOL, composeStyle, HILLSHADE_SOURCE, TERRAIN_SOURCE, WMTS_PROTOCOL } from './compose';
import { FEATURE_PROTOCOL } from './featureTiles';
import { detailsOverlay } from './detailsOverlay';
import { focusAreaOverlay, focusDraftOverlay } from './focusOverlay';
import { keepLoadedGeoJson } from './geojsonDiff';
import { withOverlays } from './overlays';
import { drawDisc, drawGlyph, parsePoiImageId, POI_DISC } from './poiIcons';
import { loadCachedTile, loadTile } from './protocols';
import { routeOverlay } from './routeOverlay';
import { TerrainControl } from './terrainControl';

maplibregl.setWorkerUrl(workerUrl);
maplibregl.addProtocol(FEATURE_PROTOCOL, loadTile);
maplibregl.addProtocol(WMTS_PROTOCOL, loadTile);
for (const scheme of CACHED_SCHEMES) maplibregl.addProtocol(scheme, loadCachedTile);
// geotiff.js and the protocol load with the first COG.
maplibregl.addProtocol(COG_PROTOCOL, async (params) => (await import('@geomatico/maplibre-cog-protocol')).cogProtocol(params));

/** What the app draws over the layers, bottom to top. */
const OVERLAYS = [focusAreaOverlay, focusDraftOverlay, detailsOverlay, routeOverlay];

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
    // MapLibre's default (1/450) zooms about 0.15 levels per wheel notch; this makes it about
    // 0.55, two notches to a level.
    map.scrollZoom.setWheelZoomRate(1 / 100);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 15 } }), 'top-right');
    const terrainControl = new TerrainControl(() => !!state.settings.terrain, setTerrain);
    map.addControl(terrainControl, 'top-right');
    createEffect(() => terrainControl.show(!!state.settings.terrain));
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
      // Where finer elevation ends, its tiles are missing; the map keeps the coarser ground.
      const elevation = event.sourceId === TERRAIN_SOURCE || event.sourceId === HILLSHADE_SOURCE;
      if (elevation && (event.error as { status?: number }).status === 404) return;
      const id = layerOf(event.sourceId);
      if (id) void describeLoadError(event.error).then((message) => reportLayerError(id, message));
      else console.error(event.error);
    });
    // Layer icons and the icons of ArcGIS symbols are not in any sprite; the map asks for
    // each when it needs it, and waits for the answer before laying out the tile.
    map.setMissingStyleImageResolver((id) => {
      if (map.hasImage(id)) return;
      const poi = parsePoiImageId(id);
      const layerIcon = poi && state.layers.find((l) => l.icon?.id === poi.icon)?.icon;
      const icon =
        id === POI_DISC
          ? drawDisc()
          : layerIcon
            ? drawGlyph(layerIcon, poi.size)
            : [...assets().values()].find((loaded) => loaded.icons?.has(id))?.icons?.get(id);
      if (icon) map.addImage(id, icon.image, { pixelRatio: icon.pixelRatio, sdf: icon.sdf });
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
      const layers = createMemo(() =>
        JSON.parse(
          JSON.stringify(
            composeStyle(state.layers, assets(), { focus: focusBounds(), background: state.settings.background, terrain: state.settings.terrain }),
          ),
        ),
      );
      // A layer change carries the overlays' data as it is; a change of an overlay's data
      // only replaces it.
      const transformStyle = keepLoadedGeoJson();
      createEffect(() => {
        const style = layers();
        map.setStyle(untrack(() => withOverlays(style, OVERLAYS)), { diff: true, transformStyle });
      });
      for (const overlay of OVERLAYS) {
        createEffect(on(overlay.data, (data) => map.getSource<maplibregl.GeoJSONSource>(overlay.id)?.setData(data), { defer: true }));
      }
    });
    onCleanup(() => {
      setMap(undefined);
      map.remove();
    });
  });

  return <div ref={container} class="map" />;
}
