import { geoJSONToTile } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { AJAXError, type AddProtocolAction } from 'maplibre-gl';
import { HALF_WORLD, WORLD } from '../geo/mercator';
import { requestUrl } from '../state/net';
import { FEATURE_LAYER, parseFeatureTileUrl, resolveWmtsTile } from './compose';
import { withParams } from './urls';

const EXTENT = 4096;

/** Fetches a tile; a missing one is reported as MapLibre's AJAXError, after which it shows the zoom below. */
async function fetchTile(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(requestUrl(url), { signal });
  if (!response.ok) throw new AJAXError(response.status, response.statusText, url, await response.blob());
  return response;
}

/** WMTS tiles whose matrix identifiers are not the zoom: the identifier is looked up per tile. */
export const loadWmtsMatrixTile: AddProtocolAction = async (params, abort) => {
  const response = await fetchTile(resolveWmtsTile(params.url), abort.signal);
  return { data: await response.arrayBuffer() };
};

/**
 * The query for the features in one tile: its extent in Web Mercator, the answer as
 * GeoJSON in degrees, generalised to about a pixel of a 512 px tile.
 */
export function featureQueryUrl(layerUrl: string, z: number, x: number, y: number, maxRecordCount: number): string {
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
    f: 'geojson',
  });
}

const truncatedLayers = new Set<string>();

/**
 * ArcGIS feature layer tiles: the features in the tile's extent, queried as GeoJSON and
 * cut into a vector tile, so the map loads, caches and draws them like any vector source.
 */
export const loadFeatureTile: AddProtocolAction = async (params, abort) => {
  const { z, x, y, layerUrl, maxRecordCount } = parseFeatureTileUrl(params.url);
  const response = await fetchTile(featureQueryUrl(layerUrl, z, x, y, maxRecordCount), abort.signal);
  const json = (await response.json()) as GeoJSON.FeatureCollection & {
    error?: { message?: string };
    exceededTransferLimit?: boolean;
    properties?: { exceededTransferLimit?: boolean };
  };
  if (json.error) throw new Error(`${layerUrl}: ${json.error.message ?? 'query failed'}`);
  if ((json.exceededTransferLimit || json.properties?.exceededTransferLimit) && !truncatedLayers.has(layerUrl)) {
    truncatedLayers.add(layerUrl);
    console.warn(`${layerUrl}: some tiles hold more features than one query returns; zoom in to see them all.`);
  }
  return { data: encodeFeatures(json, z, x, y) };
};

/** GeoJSON features as one vector tile. */
export function encodeFeatures(collection: GeoJSON.FeatureCollection, z: number, x: number, y: number): ArrayBuffer {
  if (!collection.features?.length) return new ArrayBuffer(0);
  const tile = geoJSONToTile(collection, z, x, y, { extent: EXTENT, buffer: 64, clip: true });
  if (!tile) return new ArrayBuffer(0);
  const bytes = fromGeojsonVt({ [FEATURE_LAYER]: tile }, { version: 2, extent: EXTENT });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
