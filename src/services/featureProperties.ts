import { iconSize } from '../model/icon';
import { FILL_SHARE, layerColor, LINE_WIDTH, OUTLINE_WIDTH, type Geometry, type Layer } from '../model/layer';
import { lineWidth } from '../model/line';

/**
 * Properties that say how a feature was drawn where it came from, rather than what it is:
 * KML styles as @tmcw/togeojson writes them, and simplestyle's markers.
 */
const STYLE_PROPERTIES = new Set([
  '@geometry-type',
  'styleUrl',
  'styleHash',
  'styleMapHash',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'fill',
  'fill-opacity',
  'icon',
  'icon-color',
  'icon-opacity',
  'icon-scale',
  'icon-heading',
  'icon-offset',
  'icon-offset-units',
  'label-color',
  'label-opacity',
  'label-scale',
  'visibility',
  'open',
  'marker-color',
  'marker-size',
  'marker-symbol',
]);

/** Whether a property says what a feature is, rather than how it was drawn. */
export function isDataProperty(key: string): boolean {
  return !STYLE_PROPERTIES.has(key);
}

/** The properties of features that can be written as labels (text and numbers), those most features have first. */
export function propertyKeys(features: Iterable<{ properties: GeoJSON.GeoJsonProperties }>): string[] {
  const counts = new Map<string, number>();
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (isDataProperty(key) && (typeof value === 'string' || typeof value === 'number')) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].sort(([a, m], [b, n]) => n - m || a.localeCompare(b)).map(([key]) => key);
}

type Simplestyle = Record<string, string | number>;

/** GeoJSON features may have no geometry. */
type FeatureGeometry = GeoJSON.Geometry | null;

const GEOMETRIES: Record<Exclude<GeoJSON.Geometry['type'], 'GeometryCollection'>, Geometry> = {
  Point: 'point',
  MultiPoint: 'point',
  LineString: 'line',
  MultiLineString: 'line',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
};

/**
 * The features with the layer's colour, opacity, line width and icon written into them as
 * simplestyle-spec properties, which other applications read, in place of the styling
 * they brought along. Dashes and labels have no such property.
 */
export function withLayerStyle(
  geojson: GeoJSON.FeatureCollection<FeatureGeometry> | GeoJSON.Feature<FeatureGeometry> | GeoJSON.Geometry,
  layer: Layer,
): GeoJSON.FeatureCollection<FeatureGeometry> | GeoJSON.Feature<FeatureGeometry> {
  const styles = simplestyles(layer);
  const styled = (feature: GeoJSON.Feature<FeatureGeometry>): GeoJSON.Feature<FeatureGeometry> => ({
    ...feature,
    properties: { ...dataProperties(feature.properties), ...styleOf(feature.geometry, styles) },
  });
  if (geojson.type === 'FeatureCollection') return { ...geojson, features: geojson.features.map(styled) };
  if (geojson.type === 'Feature') return styled(geojson);
  return styled({ type: 'Feature', geometry: geojson, properties: {} });
}

/** The simplestyle properties of each kind of geometry as the layer draws it. */
function simplestyles(layer: Layer): Record<Geometry, Simplestyle> {
  const color = layerColor(layer);
  const stroke = (width: number) => ({ stroke: color, 'stroke-width': width, 'stroke-opacity': layer.opacity });
  // simplestyle's marker symbols are Maki's icon names.
  const symbol = layer.icon?.id.startsWith('maki:') ? layer.icon.id.slice('maki:'.length) : undefined;
  // Its three marker sizes: small for dots, medium for icons at their normal size, large from twice that.
  const size = !layer.icon ? 'small' : iconSize(layer.iconSize) < 2 ? 'medium' : 'large';
  return {
    point: { 'marker-color': color, 'marker-size': size, ...(symbol && { 'marker-symbol': symbol }) },
    line: stroke(lineWidth(layer.lineWidth, LINE_WIDTH)),
    polygon: { ...stroke(lineWidth(layer.lineWidth, OUTLINE_WIDTH)), fill: color, 'fill-opacity': FILL_SHARE * layer.opacity },
  };
}

function styleOf(geometry: FeatureGeometry, styles: Record<Geometry, Simplestyle>): Simplestyle {
  if (!geometry) return {};
  if (geometry.type === 'GeometryCollection') return Object.assign({}, ...geometry.geometries.map((g) => styleOf(g, styles)));
  return styles[GEOMETRIES[geometry.type]];
}

function dataProperties(properties: GeoJSON.GeoJsonProperties): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties ?? {}).filter(([key]) => isDataProperty(key)));
}
