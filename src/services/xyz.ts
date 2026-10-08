import type { XyzSource } from '../model/layer';
import type { ServiceInfo } from './types';

/** Subdomains used for {s} when the template does not list them. */
const DEFAULT_SUBDOMAINS = ['a', 'b', 'c'];

/**
 * A tile template in the spellings other map libraries use, turned into MapLibre's: {s}
 * and {a-c} subdomains become one template per subdomain, {-y} the TMS scheme, {q} a
 * quadkey, {r} the retina suffix.
 */
export function tileTemplates(template: string, subdomains: readonly string[] = DEFAULT_SUBDOMAINS): Pick<XyzSource, 'tiles' | 'scheme'> {
  let url = template
    .trim()
    .replace(/\{zoom\}/g, '{z}')
    .replace(/\{q\}/g, '{quadkey}')
    .replace(/\{r\}/g, '{ratio}');
  let scheme: XyzSource['scheme'] = 'xyz';
  if (url.includes('{-y}')) {
    scheme = 'tms';
    url = url.replace('{-y}', '{y}');
  }
  const range = /\{([a-z0-9])-([a-z0-9])\}/.exec(url);
  let shards = url.includes('{s}') ? [...subdomains] : [];
  if (range) {
    shards = [];
    for (let c = range[1]!.charCodeAt(0); c <= range[2]!.charCodeAt(0); c++) shards.push(String.fromCharCode(c));
    url = url.replace(range[0], '{s}');
  }
  const hasTile = (url.includes('{z}') && url.includes('{x}') && url.includes('{y}')) || url.includes('{quadkey}') || url.includes('{bbox-epsg-3857}');
  if (!/^https?:\/\//i.test(url) || !hasTile) {
    throw new Error('A tile address needs {z}, {x} and {y} (or {quadkey}, or {bbox-epsg-3857}).');
  }
  return { tiles: shards.length > 0 ? shards.map((s) => url.replace('{s}', s)) : [url], scheme };
}

/** Raster tiles from a template in any of the spellings `tileTemplates` reads. */
export function xyzSource(template: string, subdomains: readonly string[] = DEFAULT_SUBDOMAINS): XyzSource {
  return { type: 'xyz', ...tileTemplates(template, subdomains), tileSize: 256 };
}

export function parseXyz(template: string): ServiceInfo {
  const source = xyzSource(template);
  const host = new URL(source.tiles[0]!.replace(/\{[^}]+\}/g, '0')).host;
  return { title: host, offers: [{ title: host, depth: 0, draft: { name: host, source } }] };
}
