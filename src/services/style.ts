import type { StyleSpecification } from 'maplibre-gl';
import { fetchResource } from '../state/net';

const styles = new Map<string, Promise<StyleSpecification>>();

/**
 * Fetches a MapLibre style once per session; a failed fetch is tried again next time.
 * Invalid layers and sources are left out: the map validates its whole style on every
 * change, so one bad layer of an imported style would otherwise hold up all layers.
 */
export function loadStyle(url: string): Promise<StyleSpecification> {
  let style = styles.get(url);
  if (!style) {
    style = fetchResource(url).then(async (response) => {
      const json = (await response.json()) as StyleSpecification;
      if (json.version !== 8 || !Array.isArray(json.layers) || typeof json.sources !== 'object') {
        throw new Error('This is not a MapLibre style.');
      }
      const { validateStyleMin } = await import('@maplibre/maplibre-gl-style-spec');
      const { style: valid, dropped } = withoutInvalid(json, validateStyleMin(json).map((e) => e.message));
      if (dropped.length > 0) console.warn(`${url}: left out what does not validate:\n${dropped.join('\n')}`);
      return valid;
    });
    style.catch(() => styles.delete(url));
    styles.set(url, style);
  }
  return style;
}

/**
 * The style without the layers and sources that validation messages name, and without the
 * layers of a dropped source. Messages start with the path of what they are about, e.g.
 * `layers[3].paint.line-width: …` or `sources.osm: …`.
 */
export function withoutInvalid(style: StyleSpecification, messages: readonly string[]): { style: StyleSpecification; dropped: string[] } {
  const badLayers = new Set<number>();
  const badSources = new Set<string>();
  for (const message of messages) {
    const layer = /^layers\[(\d+)\]/.exec(message);
    if (layer) badLayers.add(Number(layer[1]));
    const source = /^sources\.([^.:\s[]+)/.exec(message);
    if (source) badSources.add(source[1]!);
  }
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([id]) => !badSources.has(id)));
  const layers = style.layers.filter(
    (layer, i) => !badLayers.has(i) && !('source' in layer && typeof layer.source === 'string' && badSources.has(layer.source)),
  );
  const relevant = messages.filter((m) => /^(layers\[\d+\]|sources\.)/.test(m));
  return { style: { ...style, sources, layers }, dropped: relevant };
}
