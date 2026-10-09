/**
 * Reads every library entry with the app's own parsers and records whether its server lets a
 * web page read it (CORS), which decides whether the layer works without a proxy. Writes the
 * result back into the library as `cors: false` on entries that need a proxy.
 *
 * Run by hand: npm run check-library
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { entryService, type ServiceEntry } from '../src/library/library';
import { getParam, withParams } from '../src/map/urls';
import { parseFeatureService, parseMapServer, serviceUrl } from '../src/services/arcgis';
import { collectionsAddress, parseCollections } from '../src/services/ogcFeatures';
import type { ServiceInfo } from '../src/services/types';
import { parseWms } from '../src/services/wms';
import { parseWmts } from '../src/services/wmts';
import { wmsCapabilitiesUrl } from '../src/services/read';
import { parseTileJson } from '../src/services/vectorTiles';
import { parseWfs } from '../src/services/wfs';
import { parseXyz } from '../src/services/xyz';

const LIBRARY = 'src/library/library.json';
/** Where the app is served from: GitHub Pages redirects c0dev0id.github.io/webmap there. */
const ORIGIN = 'https://shagen.me';

interface Entry {
  name: string;
  type: string;
  url: string;
  cors?: boolean;
  [key: string]: unknown;
}

function documentUrl(entry: Entry): string {
  switch (entry.type) {
    case 'wms':
      return wmsCapabilitiesUrl(entry.url);
    case 'wmts':
      return /wmtscapabilities\.xml/i.test(entry.url) || getParam(entry.url, 'REQUEST')
        ? entry.url
        : withParams(entry.url, { SERVICE: 'WMTS', REQUEST: 'GetCapabilities' });
    case 'wfs':
      return withParams(entry.url, { SERVICE: 'WFS', REQUEST: 'GetCapabilities', ACCEPTVERSIONS: '2.0.0,1.1.0' });
    case 'arcgis-mapserver':
    case 'arcgis-features':
      return withParams(serviceUrl(entry.url), { f: 'json' });
    case 'xyz':
      return entry.url.replace(/\{s\}/, 'a').replace('{z}', '0').replace('{x}', '0').replace('{y}', '0');
    case 'vector-tiles':
      // A template is asked for a tile at the first zoom it has.
      return entry.url.replace('{z}', String(entry.minzoom ?? 0)).replace('{x}', '0').replace('{y}', '0');
    default:
      return entry.url;
  }
}

async function parse(entry: Entry, body: string, url: string): Promise<ServiceInfo | undefined> {
  switch (entry.type) {
    case 'wms':
      return parseWms(body, url);
    case 'wmts':
      return parseWmts(body, url);
    case 'arcgis-mapserver':
      return parseMapServer(JSON.parse(body), entry.url);
    case 'arcgis-features':
      return parseFeatureService(JSON.parse(body), entry.url);
    case 'wfs':
      return parseWfs(body, url);
    case 'ogc-features': {
      const address = collectionsAddress(entry.url);
      return address ? parseCollections(JSON.parse(body), address.collections, address.id) : undefined;
    }
    case 'vector-tiles':
      return entryService(entry as ServiceEntry) ?? parseTileJson(JSON.parse(body), entry.url);
    case 'xyz':
      return parseXyz(entry.url);
    default:
      return undefined;
  }
}

async function check(entry: Entry): Promise<string> {
  const url = documentUrl(entry).replace(/^http:/, 'https:');
  try {
    // A file is downloaded by a link, which needs no CORS: it only has to be there.
    if (entry.type === 'file') return `download, HTTP ${(await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })).status}`;
    // OGC APIs answer HTML without Accept; a COG is read only as far as its header.
    const headers = {
      Origin: ORIGIN,
      ...(entry.type === 'ogc-features' && { Accept: 'application/json' }),
      ...(entry.type === 'cog' && { Range: 'bytes=0-65535' }),
    };
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    // An error answer says nothing about CORS (servers rarely add the header to errors), so
    // the entry keeps what it had.
    if (!response.ok) return `HTTP ${response.status}, CORS not checked`;
    // Repeated headers come back joined ("*, *"), and browsers refuse those just the same:
    // the header must hold exactly one value.
    const allowed = response.headers.get('access-control-allow-origin');
    entry.cors = allowed === '*' || allowed === ORIGIN;
    const header = entry.cors ? '' : ` [Access-Control-Allow-Origin: ${allowed ?? 'none'}]`;
    const binary = entry.type === 'xyz' || entry.type === 'cog' || (entry.type === 'vector-tiles' && entry.url.includes('{z}'));
    const info = await parse(entry, binary ? '' : await response.text(), url);
    if (!info) return `ok${header}`;
    const usable = info.offers.filter((o) => o.draft).length;
    const refused = info.offers.filter((o) => o.reason).length;
    return `${usable} usable, ${refused} refused${header}`;
  } catch (error) {
    return `failed: ${(error as Error).message}`;
  }
}

it('checks the library', { timeout: 600_000 }, async () => {
  const library = JSON.parse(readFileSync(LIBRARY, 'utf8')) as { entries: Entry[] };
  const results = new Map<Entry, string>();
  const queue = [...library.entries];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) results.set(entry, await check(entry));
    }),
  );
  for (const entry of library.entries) {
    const mark = entry.type === 'file' ? 'file   ' : entry.cors ? 'cors   ' : 'NO CORS';
    console.log(`${mark}  ${entry.name}: ${results.get(entry)}`);
    if (entry.cors) delete entry.cors;
  }
  writeFileSync(LIBRARY, `${JSON.stringify(library, null, 2)}\n`);
});
