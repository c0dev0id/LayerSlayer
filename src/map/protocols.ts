import { geoJSONToTile } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { AJAXError, type AddProtocolAction } from 'maplibre-gl';
import { HALF_WORLD, WORLD } from '../geo/mercator';
import { hostOf, requestUrl } from '../state/net';
import { CACHE_PREFIX, FEATURE_LAYER, FEATURE_PROTOCOL, parseFeatureTileUrl, resolveWmtsTile, WMTS_PROTOCOL, type FeatureTile } from './compose';
import { createLimiter } from './limit';
import { cachedTile, storeTile } from './tileCache';
import { withParams } from './urls';

const EXTENT = 4096;

/** Fetches a tile; a missing one is reported as MapLibre's AJAXError, after which it shows the zoom below. */
async function fetchTile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(requestUrl(url), { signal });
  if (!response.ok) throw new AJAXError(response.status, response.statusText, url, await response.blob());
  return response.arrayBuffer();
}

/**
 * The query for the features in one tile: its extent in Web Mercator, the answer as
 * GeoJSON in degrees, generalised to about a pixel of a 512 px tile. A tile query
 * (`resultType=tile`) is allowed more records and is answered much faster by hosted
 * services, which optimise for it.
 */
export function featureQueryUrl({ layerUrl, z, x, y, maxRecordCount, tileQueries }: FeatureTile): string {
  const size = WORLD / 2 ** z;
  const xmin = -HALF_WORLD + x * size;
  const ymax = HALF_WORLD - y * size;
  const round = (v: number) => Math.round(v * 100) / 100;
  return withParams(`${layerUrl}/query`, {
    where: '1=1',
    geometry: [xmin, ymax - size, xmin + size, ymax].map(round).join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: 3857,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    outSR: 4326,
    maxAllowableOffset: 360 / 2 ** z / 1024,
    resultRecordCount: maxRecordCount,
    ...(tileQueries && { resultType: 'tile' }),
    f: 'geojson',
  });
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
 * An ArcGIS feature layer tile: the features in the tile's extent, queried as GeoJSON and
 * cut into a vector tile, so the map loads, caches and draws them like any vector source.
 * Queries to one server are limited.
 */
function featureTile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const feature = parseFeatureTileUrl(url);
  const { z, x, y, layerUrl } = feature;
  const query = featureQueryUrl(feature);
  return limiterFor(query)(async () => {
    const json = JSON.parse(new TextDecoder().decode(await fetchTile(query, signal))) as GeoJSON.FeatureCollection & {
      error?: { message?: string };
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
    };
    if (json.error) throw new Error(`${layerUrl}: ${json.error.message ?? 'query failed'}`);
    if ((json.exceededTransferLimit || json.properties?.exceededTransferLimit) && !truncatedLayers.has(layerUrl)) {
      truncatedLayers.add(layerUrl);
      console.warn(`${layerUrl}: some tiles hold more features than one query returns; zoom in to see them all.`);
    }
    return encodeFeatures(json, z, x, y);
  }, signal);
}

/** Any tile the map asks for: a plain address, a WMTS matrix tile or a feature tile. */
function tile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (url.startsWith(`${WMTS_PROTOCOL}://`)) return fetchTile(resolveWmtsTile(url), signal);
  if (url.startsWith(`${FEATURE_PROTOCOL}://`)) return featureTile(url, signal);
  return fetchTile(url, signal);
}

/** The address a tile is kept under in the cache: the request that answers it. */
export function cacheKey(url: string): string {
  if (url.startsWith(`${WMTS_PROTOCOL}://`)) return resolveWmtsTile(url);
  if (url.startsWith(`${FEATURE_PROTOCOL}://`)) return featureQueryUrl(parseFeatureTileUrl(url));
  return url;
}

/** WMTS tiles whose matrix identifiers are not the zoom, and ArcGIS feature tiles. */
export const loadTile: AddProtocolAction = async (params, abort) => ({ data: await tile(params.url, abort.signal) });

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

/** GeoJSON features as one vector tile. */
export function encodeFeatures(collection: GeoJSON.FeatureCollection, z: number, x: number, y: number): ArrayBuffer {
  if (!collection.features?.length) return new ArrayBuffer(0);
  const tile = geoJSONToTile(collection, z, x, y, { extent: EXTENT, buffer: 64, clip: true });
  if (!tile) return new ArrayBuffer(0);
  const bytes = fromGeojsonVt({ [FEATURE_LAYER]: tile }, { version: 2, extent: EXTENT });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
