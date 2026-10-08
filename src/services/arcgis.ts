import { HALF_WORLD, mercatorToLngLat, scaleToZoom, tileZoom, validBounds } from '../geo/mercator';
import type { Bounds, Geometry, LayerDraft } from '../model/layer';
import type { Offer, ServiceInfo } from './types';

interface SpatialReference {
  wkid?: number;
  latestWkid?: number;
}

interface Extent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: SpatialReference;
}

interface ServiceLayer {
  id: number;
  name: string;
  parentLayerId?: number;
  minScale?: number;
  maxScale?: number;
  type?: string;
  geometryType?: string;
}

interface MapServer {
  mapName?: string;
  serviceDescription?: string;
  description?: string;
  copyrightText?: string;
  capabilities?: string;
  singleFusedMapCache?: boolean;
  tileInfo?: {
    rows: number;
    cols: number;
    origin: { x: number; y: number };
    spatialReference: SpatialReference;
    lods: { level: number; resolution: number }[];
  };
  fullExtent?: Extent;
  supportedImageFormatTypes?: string;
  maxRecordCount?: number;
  layers?: ServiceLayer[];
  error?: { message?: string };
}

interface FeatureLayer extends ServiceLayer {
  description?: string;
  copyrightText?: string;
  extent?: Extent;
  maxRecordCount?: number;
  supportedQueryFormats?: string;
  error?: { message?: string };
}

const MERCATOR_WKIDS = new Set([3857, 102100, 102113, 900913]);

/**
 * The lowest zoom a feature layer is shown at unless the service asks for more. Below it a
 * view needs few tiles, but each covers so much that the server returns its whole record
 * limit for it, slowly; the layer's zoom range can be widened in the panel.
 */
export const FEATURE_MINZOOM = 9;
/** Geographic coordinate systems whose degrees are close enough to WGS 84 for bounds. */
const DEGREE_WKIDS = new Set([4326, 4269, 4258, 4283, 4617]);

/** The service endpoint without query, fragment or trailing slash. */
export function serviceUrl(url: string): string {
  return url.split(/[?#]/)[0]!.replace(/\/+$/, '');
}

function checkError(json: { error?: { message?: string } }): void {
  if (json.error) throw new Error(`The ArcGIS server refused: ${json.error.message ?? 'unknown error'}`);
}

/** Reads a MapServer's description (`…/MapServer?f=json`). */
export function parseMapServer(json: MapServer, url: string): ServiceInfo {
  checkError(json);
  if (!Array.isArray(json.layers) && !json.tileInfo) throw new Error('This is not an ArcGIS MapServer description.');
  const base = serviceUrl(url);
  const title = json.mapName || base.split('/').slice(-2, -1)[0] || 'MapServer';
  const shared = {
    ...(json.copyrightText && { attribution: json.copyrightText }),
    ...(extentBounds(json.fullExtent) && { bounds: extentBounds(json.fullExtent) }),
  };
  const description = plainText(json.serviceDescription || json.description);
  const info: ServiceInfo = { title, ...(description && { description }), offers: [] };

  const tiled = cachedTiles(json);
  if (tiled) {
    info.offers.push({
      title: `${title} (cached tiles)`,
      depth: 0,
      draft: {
        name: title,
        source: { type: 'xyz', tiles: [`${base}/tile/{z}/{y}/{x}`], scheme: 'xyz', tileSize: tiled.tileSize, ...tiled.zooms },
        ...shared,
      },
    });
    return info;
  }

  if (!/\bMap\b/.test(json.capabilities ?? 'Map')) {
    info.offers.push({ title, depth: 0, reason: 'The service draws no maps (no Map capability).' });
    return info;
  }
  const formats = (json.supportedImageFormatTypes ?? '').split(',');
  const format = formats.includes('PNG32') ? 'png32' : 'png';
  const draft = (name: string, layers?: string, layer?: ServiceLayer): LayerDraft => ({
    name,
    source: { type: 'arcgis-map', url: base, format, ...(layers && { layers }) },
    ...shared,
    ...scaleRange(layer),
  });
  info.offers.push({ title: `${title} (all layers)`, depth: 0, draft: draft(title) });
  const layers = json.layers ?? [];
  const depthOf = (layer: ServiceLayer): number => {
    const parent = layers.find((l) => l.id === layer.parentLayerId);
    return parent ? depthOf(parent) + 1 : 1;
  };
  for (const layer of layers) {
    info.offers.push({ title: layer.name, name: String(layer.id), depth: depthOf(layer), draft: draft(layer.name, `show:${layer.id}`, layer) });
  }
  return info;
}

/** The tile cache as XYZ tiles, if it is Web Mercator with levels numbered by zoom. */
function cachedTiles(json: MapServer): { tileSize: number; zooms: { minzoom: number; maxzoom: number } } | undefined {
  const tiles = json.tileInfo;
  if (!json.singleFusedMapCache || !tiles || tiles.rows !== tiles.cols) return undefined;
  const wkid = tiles.spatialReference.latestWkid ?? tiles.spatialReference.wkid;
  if (!wkid || !MERCATOR_WKIDS.has(wkid)) return undefined;
  if (Math.abs(tiles.origin.x + HALF_WORLD) > 1 || Math.abs(tiles.origin.y - HALF_WORLD) > 1) return undefined;
  const levels = tiles.lods.map((lod) => lod.level);
  if (levels.length === 0 || tiles.lods.some((lod) => tileZoom(lod.resolution, tiles.rows) !== lod.level)) return undefined;
  return { tileSize: tiles.rows, zooms: { minzoom: Math.min(...levels), maxzoom: Math.max(...levels) } };
}

/** Reads a FeatureServer's description, or the description of one of its layers. */
export function parseFeatureService(json: MapServer | FeatureLayer, url: string): ServiceInfo {
  checkError(json);
  const base = serviceUrl(url);
  if ('geometryType' in json && typeof (json as FeatureLayer).id === 'number' && !('layers' in json)) {
    const layer = json as FeatureLayer;
    const offer = featureOffer(layer, base, layer.maxRecordCount, layer.supportedQueryFormats, 0);
    return { title: layer.name, ...(layer.description && { description: plainText(layer.description) }), offers: [offer] };
  }
  const service = json as MapServer & { supportedQueryFormats?: string };
  if (!Array.isArray(service.layers)) throw new Error('This is not an ArcGIS FeatureServer description.');
  const description = plainText(service.serviceDescription || service.description);
  return {
    title: base.split('/').slice(-2, -1)[0] ?? 'FeatureServer',
    ...(description && { description }),
    // A service's query formats can understate its layers' (hosted layers add geoJSON),
    // so they are not checked here; a layer that cannot answer shows its error when drawn.
    offers: service.layers.map((layer) =>
      featureOffer({ ...layer, copyrightText: service.copyrightText }, `${base}/${layer.id}`, service.maxRecordCount, undefined, 0),
    ),
  };
}

function featureOffer(
  layer: FeatureLayer,
  layerUrl: string,
  maxRecordCount: number | undefined,
  queryFormats: string | undefined,
  depth: number,
): Offer {
  const offer: Offer = { title: layer.name, name: String(layer.id), depth };
  const geometry = geometryOf(layer.geometryType);
  if (!geometry) {
    offer.reason = layer.type === 'Group Layer' ? undefined : 'Not a layer with geometries.';
    return offer;
  }
  if (queryFormats !== undefined && !/geojson/i.test(queryFormats)) {
    offer.reason = 'The server cannot answer queries in GeoJSON.';
    return offer;
  }
  const bounds = extentBounds(layer.extent);
  const range = scaleRange(layer);
  offer.draft = {
    name: layer.name,
    source: { type: 'arcgis-features', url: layerUrl, geometry, maxRecordCount: maxRecordCount ?? 1000 },
    ...(bounds && { bounds }),
    ...(layer.copyrightText && { attribution: layer.copyrightText }),
    ...range,
    minzoom: Math.max(FEATURE_MINZOOM, range.minzoom ?? 0),
  };
  return offer;
}

function geometryOf(type: string | undefined): Geometry | undefined {
  switch (type) {
    case 'esriGeometryPoint':
    case 'esriGeometryMultipoint':
      return 'point';
    case 'esriGeometryPolyline':
      return 'line';
    case 'esriGeometryPolygon':
    case 'esriGeometryEnvelope':
      return 'polygon';
    default:
      return undefined;
  }
}

/** Map zooms from ArcGIS scales: minScale is the smallest scale shown, maxScale the largest; 0 means none. */
function scaleRange(layer: ServiceLayer | undefined): { minzoom?: number; maxzoom?: number } {
  return {
    ...(layer?.minScale && { minzoom: Math.max(0, Math.floor(scaleToZoom(layer.minScale) * 10) / 10) }),
    ...(layer?.maxScale && { maxzoom: Math.min(24, Math.ceil(scaleToZoom(layer.maxScale) * 10) / 10) }),
  };
}

function extentBounds(extent: Extent | undefined): Bounds | undefined {
  if (!extent) return undefined;
  const wkid = extent.spatialReference?.latestWkid ?? extent.spatialReference?.wkid;
  if (wkid && MERCATOR_WKIDS.has(wkid)) {
    const clamp = (v: number) => Math.max(-HALF_WORLD, Math.min(HALF_WORLD, v));
    const [west, south] = mercatorToLngLat(clamp(extent.xmin), clamp(extent.ymin));
    const [east, north] = mercatorToLngLat(clamp(extent.xmax), clamp(extent.ymax));
    return validBounds(west, south, east, north);
  }
  if (wkid && DEGREE_WKIDS.has(wkid)) return validBounds(extent.xmin, extent.ymin, extent.xmax, extent.ymax);
  return undefined;
}

/** Service descriptions are often HTML; the panel shows them as text. */
function plainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim();
  return text ? text : undefined;
}
