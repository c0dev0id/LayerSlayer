import type { MapIcon } from './icon';

/** West, south, east, north in degrees. */
export type Bounds = [number, number, number, number];

/** Longitude and latitude of an image's corners: top left, top right, bottom right, bottom left. */
export type Corners = [[number, number], [number, number], [number, number], [number, number]];

/** Data the map reads from the network, or from a file kept in the browser. */
export type Resource = { url: string } | FileResource;

/** A file kept in the browser under `file`, chosen as `name`. */
export interface FileResource {
  file: string;
  name: string;
  /** When the file was last changed, as an ISO 8601 time, where the browser said. */
  modified?: string;
}

/** Raster tiles addressed by an XYZ (or TMS) template; one template per subdomain. */
export interface XyzSource {
  type: 'xyz';
  tiles: string[];
  scheme: 'xyz' | 'tms';
  tileSize: number;
  /** Tile zooms the server has, where known. */
  minzoom?: number;
  maxzoom?: number;
}

/** One or more layers of a WMS, drawn by GetMap requests for each tile's extent. */
export interface WmsSource {
  type: 'wms';
  /** The GetMap endpoint. */
  url: string;
  version: '1.1.1' | '1.3.0';
  layers: string;
  styles: string;
  format: string;
  /** The service's name for Web Mercator, e.g. EPSG:3857 or EPSG:900913. */
  crs: string;
}

/** A WMTS layer in a tile matrix set that lines up with Web Mercator tiles. */
export interface WmtsSource {
  type: 'wmts';
  /** Tile URL with {TileMatrix}, {TileRow} and {TileCol} still in it. */
  template: string;
  /** Tile matrix identifier by tile zoom, for the zooms the set has. */
  matrices: Record<string, string>;
  tileSize: number;
}

/** An ArcGIS MapServer drawn by export requests, all layers or the ones in `layers`. */
export interface ArcGisMapSource {
  type: 'arcgis-map';
  /** The MapServer endpoint, without a trailing slash. */
  url: string;
  /** The export's layers parameter, e.g. show:3,4; absent draws the service's defaults. */
  layers?: string;
  format: string;
}

export type Geometry = 'point' | 'line' | 'polygon';

/** An ArcGIS feature layer, queried per vector tile. */
export interface ArcGisFeatureSource {
  type: 'arcgis-features';
  /** The layer endpoint, e.g. …/FeatureServer/0. */
  url: string;
  geometry: Geometry;
  /** Most features one query returns. */
  maxRecordCount: number;
  /** Ask with tile queries (`resultType=tile`), which the layer supports. */
  tileQueries?: boolean;
}

/** One layer of a vector tile set (MVT) that brings no style, drawn in the layer's colour. */
export interface VectorTilesSource {
  type: 'vector-tiles';
  tiles: string[];
  scheme?: 'tms';
  /** The tile layer drawn (`source-layer`). */
  layer: string;
  /** Tile zooms the server has; the map enlarges the highest one beyond it. */
  minzoom?: number;
  maxzoom?: number;
}

/** A WFS feature type, queried per vector tile for GeoJSON. */
export interface WfsSource {
  type: 'wfs';
  /** The GetFeature endpoint. */
  url: string;
  version: '2.0.0' | '1.1.0';
  typeName: string;
  /** The server's name for GeoJSON output, e.g. application/json. */
  outputFormat: string;
  /** Most features one query returns. */
  maxFeatures: number;
}

/** An OGC API – Features collection, queried per vector tile. */
export interface OgcFeaturesSource {
  type: 'ogc-features';
  /** The collection's items endpoint, answering GeoJSON. */
  url: string;
  /** Most features one query returns. */
  limit: number;
}

/** Sources whose features are queried per vector tile and cut into tiles in the browser. */
export type FeatureSource = ArcGisFeatureSource | WfsSource | OgcFeaturesSource;

export function isFeatureSource(source: LayerSource): source is FeatureSource {
  return source.type === 'arcgis-features' || source.type === 'wfs' || source.type === 'ogc-features';
}

export interface GeoJsonSource {
  type: 'geojson';
  data: Resource;
  /** For a file made by an OSM query: the query, which Update runs again. */
  query?: OsmQuery;
}

/**
 * The query OpenStreetMap features were found with in the focus area. Updating runs it
 * again, in the focus area of that time.
 */
export interface OsmQuery {
  /** Tag filters as services/overpass reads them; features matching any of them were found. */
  filters: string[];
  /** When the query ran, as an ISO 8601 time. */
  queried: string;
}

/** A MapLibre style; its sources and layers join the map as one layer. */
export interface StyleSource {
  type: 'style';
  url: string;
}

/**
 * A Cloud Optimized GeoTIFF in Web Mercator, read by range requests and drawn as raster
 * tiles: in its own colours, or for single-band data with a colour ramp over `ramp`.
 */
export interface CogSource {
  type: 'cog';
  url: string;
  ramp?: { min: number; max: number };
}

/** A georeferenced picture, e.g. a rendered GeoPDF page. */
export interface ImageSource {
  type: 'image';
  data: Resource;
  coordinates: Corners;
}

export type LayerSource =
  | XyzSource
  | WmsSource
  | WmtsSource
  | ArcGisMapSource
  | ArcGisFeatureSource
  | VectorTilesSource
  | WfsSource
  | OgcFeaturesSource
  | GeoJsonSource
  | StyleSource
  | CogSource
  | ImageSource;

export interface Layer {
  id: string;
  name: string;
  source: LayerSource;
  visible: boolean;
  /** 0 to 1. */
  opacity: number;
  /** Map zooms the layer is shown at. */
  minzoom: number;
  maxzoom: number;
  /** Colour of a vector layer that brings no style of its own, as #rrggbb. */
  color?: string;
  /** Colour adjustments of a raster layer; none means the image as it comes. */
  adjust?: RasterAdjustments;
  /** An ArcGIS feature layer drawn with the service's own symbols instead of `color`. */
  ownStyle?: boolean;
  /** The icon a vector layer's points and areas are marked with, on a disc of its colour. */
  icon?: MapIcon;
  /** How many times its normal size the icon is drawn, MIN_ICON_SIZE to MAX_ICON_SIZE; 1 where unset. */
  iconSize?: number;
  /** Width of a vector layer's lines and area outlines in pixels; 2.5 for lines and 1.5 for outlines where unset. */
  lineWidth?: number;
  /** How a vector layer's lines and area outlines are dashed; solid where unset. */
  lineDash?: LineDash;
  /** The feature property a vector layer writes beside its features: along lines, next to points and in areas. */
  label?: string;
  /** Where the source has data; raster tiles are not fetched outside it. */
  bounds?: Bounds;
  attribution?: string;
  /** Whether the layer keeps its tiles in the browser where it can; see `keepsTiles`. */
  cache?: boolean;
  /**
   * Where the layer was added from: the source's address, followed by a space (which no
   * address contains) and the layer's name where the source names its layers. Lets the
   * add-layer lists show what is on the map. For a layer made from a file, the address the
   * file was downloaded from, if any: a link there fetches a newer version.
   */
  origin?: string;
}

/**
 * MapLibre's colour adjustments of raster layers, applied per pixel in this order: hue
 * rotation, saturation, contrast, then the brightness range each colour is fitted into.
 */
export interface RasterAdjustments {
  /** Degrees, 0 to 360. */
  hue: number;
  /** -1 (grey) to 1. */
  saturation: number;
  /** -1 to 1. */
  contrast: number;
  /** What black becomes, 0 to 1; above `brightnessMax` the image is inverted. */
  brightnessMin: number;
  /** What white becomes, 0 to 1. */
  brightnessMax: number;
}

export const NO_ADJUSTMENTS: RasterAdjustments = { hue: 0, saturation: 0, contrast: 0, brightnessMin: 0, brightnessMax: 1 };

/** What a service offers to add: a layer before it gets an id and the user's settings. */
export type LayerDraft = Pick<Layer, 'name' | 'source'> &
  Partial<Pick<Layer, 'opacity' | 'minzoom' | 'maxzoom' | 'bounds' | 'attribution' | 'origin' | 'icon' | 'ownStyle'>>;

/** New layers are half transparent, so what lies below them shows; layers with an icon start opaque, as icons read best that way. */
const DEFAULT_OPACITY = 0.5;

export type LineDash = 'dashed' | 'long-dashed' | 'dotted';

export const MIN_LINE_WIDTH = 0.5;
export const MAX_LINE_WIDTH = 10;


export const MIN_ZOOM = 0;
export const MAX_ZOOM = 24;

/** Colours handed out to vector layers in turn; they read on light and dark base maps. */
export const VECTOR_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131'];

/** The colour a vector layer is drawn in. */
export function layerColor(layer: Layer): string {
  return layer.color ?? VECTOR_COLORS[0]!;
}

interface SourceKind {
  /** Its name in the panel. */
  label: string;
  /** Drawn with the app's own vector style, coloured by the layer's `color`. */
  vector?: boolean;
  /** Drawn as a raster layer, whose colours can be adjusted. */
  raster?: boolean;
  /** Its tiles can be kept in the browser. */
  cache?: boolean;
}

/** What the app knows of each kind of source; every kind is listed, so a new one cannot be missed. */
export const SOURCE_KINDS: Record<LayerSource['type'], SourceKind> = {
  xyz: { label: 'XYZ tiles', raster: true, cache: true },
  wms: { label: 'WMS', raster: true, cache: true },
  wmts: { label: 'WMTS', raster: true, cache: true },
  'arcgis-map': { label: 'ArcGIS MapServer', raster: true, cache: true },
  'arcgis-features': { label: 'ArcGIS features', vector: true, cache: true },
  'vector-tiles': { label: 'Vector tiles', vector: true, cache: true },
  wfs: { label: 'WFS', vector: true, cache: true },
  'ogc-features': { label: 'OGC API – Features', vector: true, cache: true },
  geojson: { label: 'GeoJSON', vector: true },
  style: { label: 'MapLibre style' },
  cog: { label: 'Cloud Optimized GeoTIFF', raster: true },
  image: { label: 'Georeferenced image', raster: true },
};

export function isVector(source: LayerSource): boolean {
  return SOURCE_KINDS[source.type].vector === true;
}

export function isRaster(source: LayerSource): boolean {
  return SOURCE_KINDS[source.type].raster === true;
}

/** Whether the layer keeps its tiles in the browser: where its source allows, unless switched off. */
export function keepsTiles(layer: Layer): boolean {
  return canCache(layer.source) && layer.cache !== false;
}

/**
 * Whether the source's tiles can be kept in the browser: tiled sources whose tiles the app
 * can address. A style's tiles come from addresses inside the style; GeoJSON and images
 * are single files.
 */
export function canCache(source: LayerSource): boolean {
  return SOURCE_KINDS[source.type].cache === true;
}

/** The file a layer keeps in the browser, if any. */
export function fileResource(source: LayerSource): FileResource | undefined {
  return (source.type === 'geojson' || source.type === 'image') && 'file' in source.data ? source.data : undefined;
}

/** The key of the file a layer keeps in the browser, if any. */
export function storedFile(source: LayerSource): string | undefined {
  return fileResource(source)?.file;
}

/** The files the layers keep in the browser. */
export function storedFiles(layers: readonly Layer[]): Set<string> {
  return new Set(layers.map((l) => storedFile(l.source)).filter((f): f is string => f !== undefined));
}

export function createLayer(draft: LayerDraft, existing: readonly Layer[], id: string = crypto.randomUUID()): Layer {
  const layer: Layer = {
    id,
    visible: true,
    opacity: draft.icon ? 1 : DEFAULT_OPACITY,
    minzoom: MIN_ZOOM,
    maxzoom: MAX_ZOOM,
    ...draft,
  };
  if (isVector(draft.source)) {
    const used = existing.filter((l) => isVector(l.source)).length;
    layer.color = VECTOR_COLORS[used % VECTOR_COLORS.length];
  }
  return layer;
}
