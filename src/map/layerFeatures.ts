import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { isFeatureSource, type Layer } from '../model/layer';
import { FEATURE_LAYER } from './featureTiles';

/** The tile layer a vector layer's features are drawn from; none for GeoJSON. */
function sourceLayerOf(layer: Layer): string | undefined {
  if (layer.source.type === 'vector-tiles') return layer.source.layer;
  return isFeatureSource(layer.source) ? FEATURE_LAYER : undefined;
}

/**
 * The features of a vector layer the map holds: all of a GeoJSON file's, and those of the
 * tiles loaded so far for tiled sources.
 */
export async function layerFeatures(map: MapLibreMap, layer: Layer): Promise<{ properties: GeoJSON.GeoJsonProperties }[]> {
  const source = map.getSource(layer.id);
  if (!source) return [];
  if (source.type === 'geojson') {
    const data = await (source as GeoJSONSource).getData();
    return data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];
  }
  const sourceLayer = sourceLayerOf(layer);
  return map.querySourceFeatures(layer.id, sourceLayer ? { sourceLayer } : undefined);
}
