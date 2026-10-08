import { HALF_WORLD, mercatorToLngLat, WORLD } from '../geo/mercator';
import type { FeatureSource } from '../model/layer';
import { withParams } from './urls';

/**
 * Vector tiles of feature sources (ArcGIS feature layers, WFS feature types, OGC API
 * collections): the tile address the map asks for, the query that answers it, and reading
 * the GeoJSON that comes back.
 */

export const FEATURE_PROTOCOL = 'features';

/** One tile of a feature source. */
export interface FeatureTile {
  z: number;
  x: number;
  y: number;
  source: FeatureSource;
}

/** The tile address template of a feature source; the source travels with every tile. */
export function featureTileUrl(source: FeatureSource): string {
  return `${FEATURE_PROTOCOL}://{z}/{x}/{y}?source=${encodeURIComponent(JSON.stringify(source))}`;
}

export function parseFeatureTileUrl(url: string): FeatureTile {
  const match = /^[^:]+:\/\/(\d+)\/(\d+)\/(\d+)\?source=(.*)$/.exec(url);
  if (!match) throw new Error(`Not a feature tile: ${url}`);
  return { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]), source: JSON.parse(decodeURIComponent(match[4]!)) as FeatureSource };
}

/** The tile's extent in Web Mercator metres: west, south, east, north. */
function tileExtent(z: number, x: number, y: number): [number, number, number, number] {
  const size = WORLD / 2 ** z;
  const west = -HALF_WORLD + x * size;
  const north = HALF_WORLD - y * size;
  return [west, north - size, west + size, north];
}

/** The tile's extent in degrees, rounded to about 0.1 m: west, south, east, north. */
function tileDegrees(z: number, x: number, y: number): [number, number, number, number] {
  const [west, south, east, north] = tileExtent(z, x, y);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const [w, s] = mercatorToLngLat(west, south);
  const [e, n] = mercatorToLngLat(east, north);
  return [round(w), round(s), round(e), round(n)];
}

/** The query for the features in one tile, answered as GeoJSON in degrees. */
export function featureQueryUrl({ z, x, y, source }: FeatureTile): string {
  switch (source.type) {
    case 'arcgis-features': {
      // The extent in Web Mercator, generalised to about a pixel of a 512 px tile. A tile
      // query (`resultType=tile`) is allowed more records and is answered much faster by
      // hosted services, which optimise for it.
      const round = (v: number) => Math.round(v * 100) / 100;
      return withParams(`${source.url}/query`, {
        where: '1=1',
        geometry: tileExtent(z, x, y).map(round).join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: 3857,
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        outSR: 4326,
        maxAllowableOffset: 360 / 2 ** z / 1024,
        resultRecordCount: source.maxRecordCount,
        ...(source.tileQueries && { resultType: 'tile' }),
        f: 'geojson',
      });
    }
    case 'wfs': {
      // Servers write GeoJSON in longitude and latitude for EPSG:4326. The box names its
      // CRS in the form whose axis order is defined as latitude first, which servers that
      // read a plain EPSG:4326 box either way all follow.
      const [w, s, e, n] = tileDegrees(z, x, y);
      const v2 = source.version === '2.0.0';
      return withParams(source.url, {
        SERVICE: 'WFS',
        VERSION: source.version,
        REQUEST: 'GetFeature',
        [v2 ? 'TYPENAMES' : 'TYPENAME']: source.typeName,
        OUTPUTFORMAT: source.outputFormat,
        SRSNAME: 'EPSG:4326',
        BBOX: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`,
        [v2 ? 'COUNT' : 'MAXFEATURES']: source.maxFeatures,
      });
    }
    case 'ogc-features': {
      // The bbox parameter is in CRS84, longitude first.
      const [w, s, e, n] = tileDegrees(z, x, y);
      return withParams(source.url, { bbox: `${w},${s},${e},${n}`, limit: source.limit });
    }
  }
}

/** A name for the source in messages: its address, and the feature type of a WFS. */
export function featureSourceName(source: FeatureSource): string {
  return source.type === 'wfs' ? `${source.url} ${source.typeName}` : source.url;
}

interface FeatureAnswer extends GeoJSON.FeatureCollection {
  /** ArcGIS: more features than one query returns. */
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  /** WFS 2.0 and OGC API: how many features match, and how many came. */
  numberMatched?: number | string;
  numberReturned?: number;
  /** ArcGIS and OGC API errors. */
  error?: { message?: string };
  description?: string;
}

/** The text of an OWS or WMS exception report, which WFS servers send as XML whatever was asked for. */
function exceptionText(text: string): string | undefined {
  const match = /<(?:\w+:)?(?:ExceptionText|ServiceException)\b[^>]*>([\s\S]*?)<\//.exec(text);
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || undefined;
}

/**
 * Reads a feature query's answer: the features, and whether there were more than one query
 * returns. Errors the server reports in its own way are thrown with its message.
 */
export function readFeatureAnswer(text: string): { features: GeoJSON.FeatureCollection; truncated: boolean } {
  let answer: FeatureAnswer;
  try {
    answer = JSON.parse(text) as FeatureAnswer;
  } catch {
    throw new Error(exceptionText(text) ?? 'The server did not answer with GeoJSON.');
  }
  if (answer?.type !== 'FeatureCollection' || !Array.isArray(answer.features)) {
    throw new Error(answer?.error?.message ?? answer?.description ?? 'The server did not answer with GeoJSON.');
  }
  const matched = Number(answer.numberMatched);
  const truncated =
    answer.exceededTransferLimit === true ||
    answer.properties?.exceededTransferLimit === true ||
    (Number.isFinite(matched) && matched > (answer.numberReturned ?? answer.features.length));
  return { features: answer, truncated };
}
