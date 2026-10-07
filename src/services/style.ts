import type { StyleSpecification } from 'maplibre-gl';
import { fetchResource } from '../state/net';

const styles = new Map<string, Promise<StyleSpecification>>();

/** Fetches a MapLibre style once per session; a failed fetch is tried again next time. */
export function loadStyle(url: string): Promise<StyleSpecification> {
  let style = styles.get(url);
  if (!style) {
    style = fetchResource(url).then(async (response) => {
      const json = (await response.json()) as StyleSpecification;
      if (json.version !== 8 || !Array.isArray(json.layers) || typeof json.sources !== 'object') {
        throw new Error('This is not a MapLibre style.');
      }
      return json;
    });
    style.catch(() => styles.delete(url));
    styles.set(url, style);
  }
  return style;
}
