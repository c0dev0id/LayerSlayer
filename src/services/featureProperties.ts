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
