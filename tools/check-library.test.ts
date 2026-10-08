/**
 * Reads every library entry with the app's own parsers and records whether its server lets a
 * web page read it (CORS), which decides whether the layer works without a proxy. Writes the
 * result back into the library as `cors: false` on entries that need a proxy.
 *
 * Run by hand: npm run check-library
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { getParam, withParams } from '../src/map/urls';
import { parseFeatureService, parseMapServer, serviceUrl } from '../src/services/arcgis';
import type { ServiceInfo } from '../src/services/types';
import { parseWms } from '../src/services/wms';
import { parseWmts } from '../src/services/wmts';
import { parseXyz } from '../src/services/xyz';

const LIBRARY = 'src/library/library.json';
const ORIGIN = 'https://c0dev0id.github.io';

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
      return withParams(entry.url, { SERVICE: 'WMS', REQUEST: 'GetCapabilities' });
    case 'wmts':
      return /wmtscapabilities\.xml/i.test(entry.url) || getParam(entry.url, 'REQUEST')
        ? entry.url
        : withParams(entry.url, { SERVICE: 'WMTS', REQUEST: 'GetCapabilities' });
    case 'arcgis-mapserver':
    case 'arcgis-features':
      return withParams(serviceUrl(entry.url), { f: 'json' });
    case 'xyz':
      return entry.url.replace(/\{s\}/, 'a').replace('{z}', '0').replace('{x}', '0').replace('{y}', '0');
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
    case 'xyz':
      return parseXyz(entry.url);
    default:
      return undefined;
  }
}

async function check(entry: Entry): Promise<string> {
  const url = documentUrl(entry).replace(/^http:/, 'https:');
  try {
    const response = await fetch(url, { headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(30_000) });
    // Repeated headers come back joined ("*, *"), and browsers refuse those just the same:
    // the header must hold exactly one value.
    const allowed = response.headers.get('access-control-allow-origin');
    entry.cors = allowed === '*' || allowed === ORIGIN;
    const header = entry.cors ? '' : ` [Access-Control-Allow-Origin: ${allowed ?? 'none'}]`;
    if (!response.ok) return `HTTP ${response.status}${header}`;
    const info = await parse(entry, entry.type === 'xyz' ? '' : await response.text(), url);
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
    console.log(`${entry.cors ? 'cors ' : 'NO CORS'}  ${entry.name}: ${results.get(entry)}`);
    if (entry.cors) delete entry.cors;
  }
  writeFileSync(LIBRARY, `${JSON.stringify(library, null, 2)}\n`);
});
