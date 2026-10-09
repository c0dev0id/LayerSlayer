import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
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
 * The features of a vector layer the map holds: all of a GeoJSON file's once it has
 * loaded, and those of the tiles loaded so far for tiled sources.
 */
export async function layerFeatures(map: MapLibreMap, layer: Layer): Promise<{ properties: GeoJSON.GeoJsonProperties }[]> {
  const source = map.getSource(layer.id);
  if (!source) return [];
  if (source.type === 'geojson') {
    // Before its data has loaded (or where it failed), getData would wait for it.
    if (!map.isSourceLoaded(layer.id)) return [];
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
 * tile by tile). Lines and areas have their geometry of all the tiles loaded, not only of
 * those tapped.
 */
export function featuresAt(map: MapLibreMap, point: { x: number; y: number }, radius: number, layers: readonly Layer[]): LayerFeature[] {
  // A vector layer's source is named by the layer's id.
  const vector = new Map(layers.filter((l) => l.visible && isVector(l.source)).map((l) => [l.id, l]));
  const styleLayers = map.getLayersOrder().filter((id) => vector.has(map.getLayer(id)?.source ?? ''));
  if (styleLayers.length === 0) return [];
  const box: [PointLike, PointLike] = [
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius],
  ];
  const hits = new Map<string, MapGeoJSONFeature>();
  for (const feature of map.queryRenderedFeatures(box, { layers: styleLayers })) {
    const key = `${feature.source} ${featureKey(feature)}`;
    if (!hits.has(key)) hits.set(key, feature);
    if (hits.size === MAX_TAPPED) break;
  }
  const parts = joinedParts(map, [...hits.values()].filter((f) => !f.geometry.type.endsWith('Point')));
  return [...hits].map(([key, feature]) => {
    const layer = vector.get(feature.source)!;
    const joined = parts.get(key);
    const geometry: GeoJSON.Geometry = joined && joined.length > 1 ? { type: 'GeometryCollection', geometries: joined } : feature.geometry;
    return { layer: layer.name, ...describeFeature(feature.properties, layer.name), geometry };
  });
}

/**
 * The parts of lines and areas in all the tiles loaded, by source and feature: one query
 * per source, narrowed to features with the text, number and boolean properties of those
 * tapped.
 */
function joinedParts(map: MapLibreMap, features: MapGeoJSONFeature[]): Map<string, GeoJSON.Geometry[]> {
  const bySource = new Map<string, MapGeoJSONFeature[]>();
  for (const f of features) {
    const key = `${f.source} ${f.sourceLayer ?? ''}`;
    bySource.set(key, [...(bySource.get(key) ?? []), f]);
  }
  const parts = new Map<string, GeoJSON.Geometry[]>();
  for (const group of bySource.values()) {
    const { source, sourceLayer } = group[0]!;
    const filter = ['any', ...group.map(sameProperties)] as ExpressionSpecification;
    for (const part of map.querySourceFeatures(source, { ...(sourceLayer && { sourceLayer }), filter })) {
      const key = `${source} ${featureKey(part)}`;
      parts.set(key, [...(parts.get(key) ?? []), part.geometry]);
    }
  }
  return parts;
}

/** A filter for features with the same simple property values as `feature`. */
function sameProperties(feature: MapGeoJSONFeature): ExpressionSpecification {
  const simple = Object.entries(feature.properties).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v));
  return ['all', ...simple.map(([k, v]) => ['==', ['get', k], v])] as ExpressionSpecification;
}

/** What tells a feature from the others of its layer: its id where it has one, and its properties. */
function featureKey(feature: { id?: string | number; properties: GeoJSON.GeoJsonProperties }): string {
  return `${feature.id ?? ''} ${JSON.stringify(feature.properties)}`;
}
