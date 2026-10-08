/** West, south, east, north in degrees. */
export type Bounds = [number, number, number, number];

/** Longitude and latitude of an image's corners: top left, top right, bottom right, bottom left. */
export type Corners = [[number, number], [number, number], [number, number], [number, number]];

/** Data the map reads from the network, or from a file kept in the browser under `file`. */
export type Resource = { url: string } | { file: string; name: string };

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
}

/** A MapLibre style; its sources and layers join the map as one layer. */
export interface StyleSource {
  type: 'style';
  url: string;
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
  /** Where the source has data; raster tiles are not fetched outside it. */
  bounds?: Bounds;
  attribution?: string;
  /** Whether the layer keeps its tiles in the browser where it can; see `keepsTiles`. */
  cache?: boolean;
  /**
   * Where the layer was added from: the source's address, followed by a space (which no
   * address contains) and the layer's name where the source names its layers. Lets the
   * add-layer lists show what is on the map.
   */
  origin?: string;
}

/** What a service offers to add: a layer before it gets an id and the user's settings. */
export type LayerDraft = Pick<Layer, 'name' | 'source'> &
  Partial<Pick<Layer, 'opacity' | 'minzoom' | 'maxzoom' | 'bounds' | 'attribution' | 'origin'>>;

/** New layers are half transparent, so what lies below them shows. */
export const DEFAULT_OPACITY = 0.5;

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 24;

/** Colours handed out to vector layers in turn; they read on light and dark base maps. */
export const VECTOR_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131'];

/** Whether the source is drawn with the app's own vector style, coloured by `color`. */
export function isVector(source: LayerSource): boolean {
  return source.type === 'geojson' || source.type === 'vector-tiles' || isFeatureSource(source);
}

/**
 * Whether the source's tiles can be kept in the browser: tiled sources whose tiles the app
 * can address. A style's tiles come from addresses inside the style; GeoJSON and images
 * are single files.
 */
/** Whether the layer keeps its tiles in the browser: where its source allows, unless switched off. */
export function keepsTiles(layer: Layer): boolean {
  return canCache(layer.source) && layer.cache !== false;
}

export function canCache(source: LayerSource): boolean {
  return ['xyz', 'wms', 'wmts', 'arcgis-map', 'vector-tiles'].includes(source.type) || isFeatureSource(source);
}

/** The file a layer keeps in the browser, if any. */
export function storedFile(source: LayerSource): string | undefined {
  return (source.type === 'geojson' || source.type === 'image') && 'file' in source.data ? source.data.file : undefined;
}

export function createLayer(draft: LayerDraft, existing: readonly Layer[], id: string = crypto.randomUUID()): Layer {
  const layer: Layer = {
    id,
    visible: true,
    opacity: DEFAULT_OPACITY,
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
