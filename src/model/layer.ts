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
  /** Where the source has data; nothing is fetched outside. */
  bounds?: Bounds;
  attribution?: string;
}

/** What a service offers to add: a layer before it gets an id and the user's settings. */
export type LayerDraft = Pick<Layer, 'name' | 'source'> &
  Partial<Pick<Layer, 'minzoom' | 'maxzoom' | 'bounds' | 'attribution'>>;

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 24;

/** Colours handed out to vector layers in turn; they read on light and dark base maps. */
export const VECTOR_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131'];

/** Whether the source is drawn with the app's own vector style, coloured by `color`. */
export function isVector(source: LayerSource): boolean {
  return source.type === 'geojson' || source.type === 'arcgis-features';
}

/** The file a layer keeps in the browser, if any. */
export function storedFile(source: LayerSource): string | undefined {
  return (source.type === 'geojson' || source.type === 'image') && 'file' in source.data ? source.data.file : undefined;
}

export function createLayer(draft: LayerDraft, existing: readonly Layer[], id: string = crypto.randomUUID()): Layer {
  const layer: Layer = {
    id,
    visible: true,
    opacity: 1,
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
