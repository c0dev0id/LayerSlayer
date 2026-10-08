import { AJAXError, type AddProtocolAction } from 'maplibre-gl';
import { exceptionText } from '../services/xml';
import { hostOf, requestUrl } from '../state/net';
import { CACHE_PREFIX, resolveWmtsTile, WMTS_PROTOCOL } from './compose';
import { encodeFeatures, FEATURE_PROTOCOL, featureQueryUrl, featureSourceName, parseFeatureTileUrl, readFeatureAnswer } from './featureTiles';
import { createLimiter } from './limit';
import { cachedTile, storeTile } from './tileCache';
import { PMTILES_PROTOCOL } from './urls';

/**
 * Fetches a tile; a missing one is reported as MapLibre's AJAXError, after which it shows
 * the zoom below. An XML answer is an OGC exception report, whose text becomes the error.
 */
async function fetchTile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(requestUrl(url), { signal });
  if (!response.ok) throw new AJAXError(response.status, response.statusText, url, await response.blob());
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('xml') && !type.startsWith('image/')) {
    const reason = exceptionText(await response.text());
    throw new Error(`${hostOf(url) ?? url} answered with an error${reason ? `: ${reason}` : ' instead of a tile.'}`);
  }
  return response.arrayBuffer();
}

const truncatedLayers = new Set<string>();

/** Feature queries running at once per server; the map asks for every visible tile at once. */
const QUERIES_PER_SERVER = 4;
const limiters = new Map<string, ReturnType<typeof createLimiter>>();

function limiterFor(url: string): ReturnType<typeof createLimiter> {
  const host = hostOf(url) ?? '';
  let limiter = limiters.get(host);
  if (!limiter) limiters.set(host, (limiter = createLimiter(QUERIES_PER_SERVER)));
  return limiter;
}

/**
 * A tile of a feature source: the features in the tile's extent, queried as GeoJSON and
 * cut into a vector tile, so the map loads, caches and draws them like any vector source.
 * Queries to one server are limited.
 */
function featureTile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const tile = parseFeatureTileUrl(url);
  const query = featureQueryUrl(tile);
  return limiterFor(query)(async () => {
    const { features, truncated } = readFeatureAnswer(new TextDecoder().decode(await fetchTile(query, signal)));
    const name = featureSourceName(tile.source);
    if (truncated && !truncatedLayers.has(name)) {
      truncatedLayers.add(name);
      console.warn(`${name}: some tiles hold more features than one query returns; zoom in to see them all.`);
    }
    return encodeFeatures(features, tile.z, tile.x, tile.y);
  }, signal);
}

/** Any tile the map asks for: a plain address, a WMTS matrix tile, a feature tile or a tile of a PMTiles archive. */
async function tile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (url.startsWith(`${WMTS_PROTOCOL}://`)) return fetchTile(resolveWmtsTile(url), signal);
  if (url.startsWith(`${FEATURE_PROTOCOL}://`)) return featureTile(url, signal);
  if (url.startsWith(`${PMTILES_PROTOCOL}://`)) return (await import('../services/pmtiles')).pmtilesTile(url, signal);
  return fetchTile(url, signal);
}

/** The address a tile is kept under in the cache: the request that answers it. */
export function cacheKey(url: string): string {
  if (url.startsWith(`${WMTS_PROTOCOL}://`)) return resolveWmtsTile(url);
  if (url.startsWith(`${FEATURE_PROTOCOL}://`)) return featureQueryUrl(parseFeatureTileUrl(url));
  return url;
}

/** WMTS tiles whose matrix identifiers are not the zoom, and feature tiles. */
export const loadTile: AddProtocolAction = async (params, abort) => ({ data: await tile(params.url, abort.signal) });

/** Tiles of PMTiles archives, and the TileJSON that styles written for PMTiles ask for. */
export const loadPmtiles: AddProtocolAction = async (params, abort) =>
  params.type === 'json' ? { data: await (await import('../services/pmtiles')).pmtilesTileJson(params.url) } : loadTile(params, abort);

/**
 * Tiles of layers that keep them: answered from the tile cache while fresh, otherwise
 * fetched and kept. Errors are not kept, so a missing tile is asked for again next time.
 */
export const loadCachedTile: AddProtocolAction = async (params, abort) => {
  const url = params.url.slice(CACHE_PREFIX.length);
  const key = cacheKey(url);
  const hit = await cachedTile(key).catch(() => undefined);
  if (hit) return { data: hit };
  const data = await tile(url, abort.signal);
  // A copy, since the map may hand the returned buffer to its worker and detach it.
  void storeTile(key, data.slice(0)).catch(() => {});
  return { data };
};
