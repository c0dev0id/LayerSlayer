import { AJAXError, type AddProtocolAction } from 'maplibre-gl';
import { exceptionText } from '../services/xml';
import { hostOf, requestUrl } from '../state/net';
import { CACHE_PREFIX, resolveWmtsTile, WMTS_PROTOCOL } from './compose';
import { encodeFeatures, FEATURE_PROTOCOL, featureQueryUrl, featureSourceName, parseFeatureTileUrl, readFeatureAnswer } from './featureTiles';
import { imageProblem } from './imageCheck';
import { createLimiter } from './limit';
import { keptTile, storeTile } from './tileCache';
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

/** The PMTiles reader, loaded with the first archive's tile and kept, as tiles ask for it by the hundred. */
let pmtilesModule: Promise<typeof import('../services/pmtiles')> | undefined;
const pmtiles = () => (pmtilesModule ??= import('../services/pmtiles'));

/** Any tile the map asks for: a plain address, a WMTS matrix tile, a feature tile or a tile of a PMTiles archive. */
async function tile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (url.startsWith(`${WMTS_PROTOCOL}://`)) return fetchTile(resolveWmtsTile(url), signal);
  if (url.startsWith(`${FEATURE_PROTOCOL}://`)) return featureTile(url, signal);
  if (url.startsWith(`${PMTILES_PROTOCOL}://`)) return (await pmtiles()).pmtilesTile(url, signal);
  return fetchTile(url, signal);
}

/** The address a tile is kept under in the cache: the request that answers it. */
export function cacheKey(url: string): string {
  if (url.startsWith(`${WMTS_PROTOCOL}://`)) return resolveWmtsTile(url);
  if (url.startsWith(`${FEATURE_PROTOCOL}://`)) return featureQueryUrl(parseFeatureTileUrl(url));
  return url;
}

/**
 * A tile the map asks for, as `type` says: an image tile must be a whole image, or the map
 * would only say that it could not be decoded.
 */
async function loadTileData(url: string, type: string | undefined, signal: AbortSignal): Promise<ArrayBuffer> {
  const data = await tile(url, signal);
  const problem = type === 'image' ? imageProblem(data) : undefined;
  if (problem) {
    const address = cacheKey(url);
    throw new Error(`${hostOf(address) ?? address} answered with ${problem} instead of a tile.`);
  }
  return data;
}

/** WMTS tiles whose matrix identifiers are not the zoom, and feature tiles. */
export const loadTile: AddProtocolAction = async (params, abort) => ({ data: await loadTileData(params.url, params.type, abort.signal) });

/** Tiles of PMTiles archives, and the TileJSON that styles written for PMTiles ask for. */
export const loadPmtiles: AddProtocolAction = async (params, abort) =>
  params.type === 'json' ? { data: await (await pmtiles()).pmtilesTileJson(params.url) } : loadTile(params, abort);

/** A tile through the tile cache: whether it was fetched, its size, and its data. */
export interface CachedTile {
  fetched: boolean;
  bytes: number;
  data: () => Promise<ArrayBuffer>;
}

/**
 * A tile answered from the tile cache while fresh, otherwise fetched and kept. With
 * `always`, as precaching asks, it is kept until the cache is cleared, a tile kept for a
 * day included, and stored before this returns. Errors are not kept, an image that is not
 * whole among them, so a missing tile is asked for again next time.
 */
export async function tileThroughCache(url: string, type: string | undefined, signal: AbortSignal, always = false): Promise<CachedTile> {
  const key = cacheKey(url);
  const kept = await keptTile(key).catch(() => undefined);
  if (kept) {
    if (always && !kept.always) await storeTile(key, await kept.data(), { always });
    return { fetched: false, bytes: kept.bytes, data: kept.data };
  }
  const data = await loadTileData(url, type, signal);
  // A copy, since the map may hand the returned buffer to its worker and detach it.
  const stored = storeTile(key, data.slice(0), { always }).catch(() => {});
  if (always) await stored;
  return { fetched: true, bytes: data.byteLength, data: async () => data };
}

/** Tiles of layers that keep them, through the tile cache. */
export const loadCachedTile: AddProtocolAction = async (params, abort) => ({
  data: await (await tileThroughCache(params.url.slice(CACHE_PREFIX.length), params.type, abort.signal)).data(),
});
