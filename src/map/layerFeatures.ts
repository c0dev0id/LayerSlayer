import type { GeoJSONSource, Map as MapLibreMap, PointLike } from 'maplibre-gl';
import { isFeatureSource, isVector, type Layer } from '../model/layer';
import { describeFeature } from '../services/featureDetails';
import type { LayerFeature } from '../state/details';
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

/** Most features a tap shows. */
const MAX_TAPPED = 10;

/**
 * The features of the vector layers drawn within `radius` pixels of a point, in words:
 * topmost first, each once, though the map draws it in several parts (line and label,
 * tile by tile). Each has its geometry of all the tiles loaded, not only of those tapped.
 */
export function featuresAt(map: MapLibreMap, point: { x: number; y: number }, radius: number, layers: readonly Layer[]): LayerFeature[] {
  const vector = new Map(layers.filter((l) => l.visible && isVector(l.source)).map((l) => [l.id, l]));
  if (vector.size === 0) return [];
  const box: [PointLike, PointLike] = [
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius],
  ];
  const found: LayerFeature[] = [];
  const seen = new Set<string>();
  for (const feature of map.queryRenderedFeatures(box)) {
    // The style layers of a user layer are named by its id and their part: <id>/line.
    const layer = vector.get(feature.layer.id.split('/')[0]!);
    if (!layer) continue;
    const key = featureKey(feature);
    if (seen.has(`${layer.id} ${key}`)) continue;
    seen.add(`${layer.id} ${key}`);
    const sourceLayer = sourceLayerOf(layer);
    const parts = map
      .querySourceFeatures(layer.id, sourceLayer ? { sourceLayer } : undefined)
      .filter((part) => featureKey(part) === key)
      .map((part) => part.geometry);
    const geometry: GeoJSON.Geometry = parts.length > 1 ? { type: 'GeometryCollection', geometries: parts } : feature.geometry;
    found.push({ layer: layer.name, ...describeFeature(feature.properties, layer.name), geometry });
    if (found.length === MAX_TAPPED) break;
  }
  return found;
}

/** What tells a feature from the others of its layer: its id where it has one, and its properties. */
function featureKey(feature: { id?: string | number; properties: GeoJSON.GeoJsonProperties }): string {
  return `${feature.id ?? ''} ${JSON.stringify(feature.properties)}`;
}
