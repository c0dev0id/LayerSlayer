import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, createRoot } from 'solid-js';
import { validBounds } from '../geo/mercator';
import type { Bounds } from '../model/layer';
import { fetchResource } from '../state/net';
import { state, updateLayer } from '../state/store';
import { withParams } from './urls';

/**
 * Finds where layers have data when their source did not say: GeoJSON loaded from an
 * address, and ArcGIS feature layers, whose services often give the whole world as their
 * extent. Each layer is looked into once per session; what is found is kept with the layer.
 */

const tried = new Set<string>();

/** The extent of all features of a layer, which the server works out without sending them. */
export function featureExtentUrl(layerUrl: string): string {
  return withParams(`${layerUrl}/query`, { where: '1=1', returnExtentOnly: 'true', outSR: 4326, f: 'json' });
}

async function featureBounds(layerUrl: string): Promise<Bounds | undefined> {
  const json = (await (await fetchResource(featureExtentUrl(layerUrl))).json()) as {
    extent?: { xmin: number; ymin: number; xmax: number; ymax: number };
  };
  const e = json.extent;
  return e ? validBounds(e.xmin, e.ymin, e.xmax, e.ymax) : undefined;
}

createRoot(() => {
  createEffect(() => {
    for (const layer of state.layers) {
      const source = layer.source;
      if (source.type !== 'arcgis-features' || layer.bounds || tried.has(layer.id)) continue;
      tried.add(layer.id);
      const id = layer.id;
      featureBounds(source.url).then(
        (bounds) => bounds && updateLayer(id, { bounds }),
        () => {},
      );
    }
  });
});

/** Takes the bounds of GeoJSON layers from the map once it has loaded their data. */
export function watchGeoJsonBounds(map: MapLibreMap): void {
  map.on('sourcedata', (event) => {
    if (event.sourceDataType !== 'metadata') return;
    const layer = state.layers.find((l) => l.id === event.sourceId);
    if (!layer || layer.source.type !== 'geojson' || layer.bounds || tried.has(layer.id)) return;
    tried.add(layer.id);
    const id = layer.id;
    (map.getSource(id) as GeoJSONSource | undefined)?.getBounds().then(
      (b) => {
        if (b.isEmpty()) return;
        const bounds = validBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        if (bounds) updateLayer(id, { bounds });
      },
      () => {},
    );
  });
}
