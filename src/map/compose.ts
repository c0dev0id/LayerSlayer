import type {
  LayerSpecification,
  SourceSpecification,
  SpriteSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { intersectBounds } from '../geo/bounds';
import {
  keepsTiles,
  layerColor,
  MAX_ZOOM,
  MIN_ZOOM,
  type ArcGisMapSource,
  type Bounds,
  type Layer,
  type LayerSource,
  type WmsSource,
  type WmtsSource,
  type XyzSource,
} from '../model/layer';
import { FEATURE_LAYER, FEATURE_PROTOCOL, FEATURE_TILE_MAXZOOM, featureTileUrl } from './featureTiles';
import { parseProtocolTile, protocolTileUrl, resolveUrl, withParams } from './urls';

/**
 * What a layer needs beyond its configuration before it can be drawn: the fetched style of
 * a style layer, or an object URL for a file kept in the browser.
 */
export interface Assets {
  style?: StyleSpecification;
  url?: string;
}

/** Tiles of dynamic services (WMS, ArcGIS export) are requested at this size. */
export const DYNAMIC_TILE_SIZE = 512;

export const WMTS_PROTOCOL = 'wmts-matrix';

/** The protocol of Cloud Optimized GeoTIFFs (@geomatico/maplibre-cog-protocol). */
export const COG_PROTOCOL = 'cog';

/** The colour ramp of single-band COGs: spectral, blue for low values to red for high ones. */
const COG_RAMP = 'BrewerSpectral11';

/**
 * Put in front of a tile address of a layer that keeps its tiles (`cache+https://…`), so
 * the tile goes through the tile cache, which answers it or fetches it and keeps it.
 */
export const CACHE_PREFIX = 'cache+';

/** The schemes a cached tile address can have. */
export const CACHED_SCHEMES = ['https', 'http', WMTS_PROTOCOL, FEATURE_PROTOCOL].map((s) => CACHE_PREFIX + s);

/** The layer's tile addresses, through the tile cache where the layer keeps its tiles. */
function cached(layer: Layer, tiles: string[]): string[] {
  return keepsTiles(layer) ? tiles.map((t) => CACHE_PREFIX + t) : tiles;
}

/** One user layer as MapLibre sources and layers, plus what a style layer brings along. */
interface Fragment {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
  glyphs?: string;
  sprite?: SpriteSpecification;
}

/**
 * The whole map as one style: the visible layers bottom to top. A layer whose assets have
 * not arrived yet is left out until they do. Of the styles among the layers, the bottom
 * one brings the fonts and the default sprite; the sprite of any style above it is added
 * under the layer's id and its image references are prefixed to match. A map has one
 * font source, so labels of the upper styles need fonts the bottom one serves.
 *
 * With `focus`, the bounds of the focus area, every layer but the bottom one requests
 * tiles within them only, and a layer whose bounds lie outside is left out. The bottom
 * layer, usually the base map, is drawn everywhere, so that the area has surroundings.
 */
export function composeStyle(layers: readonly Layer[], assets: ReadonlyMap<string, Assets>, focus?: Bounds): StyleSpecification {
  const style: StyleSpecification = { version: 8, sources: {}, layers: [], transition: { duration: 0, delay: 0 } };
  const sprites: { id: string; url: string }[] = [];
  for (const [index, layer] of layers.entries()) {
    if (!layer.visible) continue;
    const within = index > 0 ? focus : undefined;
    if (within && layer.bounds && !intersectBounds(layer.bounds, within)) continue;
    const part = fragment(layer, assets.get(layer.id));
    if (!part) continue;
    let partLayers = part.layers;
    const sprite = part.sprite;
    if (sprite && sprites.length === 0) {
      sprites.push(...(typeof sprite === 'string' ? [{ id: 'default', url: sprite }] : sprite));
    } else if (typeof sprite === 'string') {
      // A sprite already in the map (the same style added twice) is shared, not repeated.
      const shared = sprites.find((s) => s.url === sprite);
      if (!shared) sprites.push({ id: layer.id, url: sprite });
      const id = shared?.id ?? layer.id;
      if (id !== 'default') partLayers = withSpriteId(partLayers, id);
    } else if (sprite) {
      console.warn(`${layer.name}: a sprite list is only supported in the bottom style; its icons are left out.`);
    }
    for (const [id, source] of Object.entries(part.sources)) style.sources[id] = withinFocus(source, within);
    style.layers.push(...partLayers);
    if (part.glyphs && !style.glyphs) style.glyphs = part.glyphs;
  }
  if (sprites.length > 0) style.sprite = sprites;
  return style;
}

function fragment(layer: Layer, assets: Assets | undefined): Fragment | undefined {
  const src = layer.source;
  switch (src.type) {
    case 'xyz':
    case 'wms':
    case 'wmts':
    case 'arcgis-map':
      return raster(layer, {
        type: 'raster',
        tiles: cached(layer, rasterTiles(src)),
        tileSize: src.type === 'xyz' || src.type === 'wmts' ? src.tileSize : DYNAMIC_TILE_SIZE,
        ...(src.type === 'xyz' && src.scheme === 'tms' && { scheme: 'tms' }),
        ...tileZooms(src),
        ...common(layer),
      });
    case 'image': {
      const url = 'url' in src.data ? src.data.url : assets?.url;
      if (!url) return undefined;
      return raster(layer, { type: 'image', url, coordinates: src.coordinates });
    }
    case 'geojson': {
      const data = 'url' in src.data ? src.data.url : assets?.url;
      if (!data) return undefined;
      return vector(layer, { type: 'geojson', data, ...(layer.attribution && { attribution: layer.attribution }) });
    }
    case 'vector-tiles':
      return vector(
        layer,
        {
          type: 'vector',
          tiles: cached(layer, src.tiles),
          ...(src.scheme && { scheme: src.scheme }),
          ...tileZooms(src),
          ...common(layer),
        },
        src.layer,
      );
    case 'cog': {
      const ramp = src.ramp && `#color:${COG_RAMP},${src.ramp.min},${src.ramp.max},c-`;
      // The protocol serves a TileJSON for the address and 256 px tiles.
      return raster(layer, { type: 'raster', url: `${COG_PROTOCOL}://${src.url}${ramp ?? ''}`, tileSize: 256, ...common(layer) });
    }
    case 'arcgis-features':
    case 'wfs':
    case 'ogc-features':
      // Not limited to the layer's bounds: they are where the features were when the layer
      // was added, and live data moves.
      return vector(
        layer,
        {
          type: 'vector',
          tiles: cached(layer, [featureTileUrl(src)]),
          maxzoom: FEATURE_TILE_MAXZOOM,
          ...(layer.attribution && { attribution: layer.attribution }),
        },
        FEATURE_LAYER,
      );
    case 'style':
      return assets?.style ? fromStyle(layer, assets.style, src.url) : undefined;
  }
}

/** Bounds and attribution of a tiled source. */
function common(layer: Layer): { bounds?: Bounds; attribution?: string } {
  return {
    ...(layer.bounds && { bounds: layer.bounds }),
    ...(layer.attribution && { attribution: layer.attribution }),
  };
}

/** The layer's zoom range, leaving out the defaults. */
function zoomRange(layer: Layer): { minzoom?: number; maxzoom?: number } {
  return {
    ...(layer.minzoom > MIN_ZOOM && { minzoom: layer.minzoom }),
    ...(layer.maxzoom < MAX_ZOOM && { maxzoom: layer.maxzoom }),
  };
}

function raster(layer: Layer, source: SourceSpecification): Fragment {
  return {
    sources: { [layer.id]: source },
    layers: [
      {
        id: layer.id,
        type: 'raster',
        source: layer.id,
        ...zoomRange(layer),
        paint: { 'raster-opacity': layer.opacity, 'raster-fade-duration': 0 },
      },
    ],
  };
}

export function rasterTiles(src: XyzSource | WmsSource | WmtsSource | ArcGisMapSource): string[] {
  switch (src.type) {
    case 'xyz':
      return src.tiles;
    case 'wms':
      return [
        withParams(src.url, {
          SERVICE: 'WMS',
          VERSION: src.version,
          REQUEST: 'GetMap',
          LAYERS: src.layers,
          STYLES: src.styles,
          FORMAT: src.format,
          TRANSPARENT: 'TRUE',
          [src.version === '1.3.0' ? 'CRS' : 'SRS']: src.crs,
          BBOX: '{bbox-epsg-3857}',
          WIDTH: DYNAMIC_TILE_SIZE,
          HEIGHT: DYNAMIC_TILE_SIZE,
        }),
      ];
    case 'wmts':
      return [wmtsTileUrl(src)];
    case 'arcgis-map':
      return [
        withParams(`${src.url}/export`, {
          bbox: '{bbox-epsg-3857}',
          bboxSR: 3857,
          imageSR: 3857,
          size: `${DYNAMIC_TILE_SIZE},${DYNAMIC_TILE_SIZE}`,
          format: src.format,
          transparent: 'true',
          f: 'image',
          ...(src.layers && { layers: src.layers }),
        }),
      ];
  }
}

/** The tile zooms a source has, where it says. */
function tileZooms(src: LayerSource): { minzoom?: number; maxzoom?: number } {
  if (src.type === 'xyz' || src.type === 'vector-tiles') {
    return {
      ...(src.minzoom !== undefined && { minzoom: src.minzoom }),
      ...(src.maxzoom !== undefined && { maxzoom: src.maxzoom }),
    };
  }
  if (src.type === 'wmts') {
    const zooms = Object.keys(src.matrices).map(Number);
    return { minzoom: Math.min(...zooms), maxzoom: Math.max(...zooms) };
  }
  return {};
}

/**
 * A WMTS tile template the map can fill in. Matrix identifiers that are the zoom, or the
 * zoom behind a common prefix (EPSG:3857:12), become {z}; any other naming goes through
 * the matrix protocol, which looks the identifier up per tile.
 */
export function wmtsTileUrl(src: WmtsSource): string {
  const entries = Object.entries(src.matrices);
  const template = src.template.replace('{TileRow}', '{y}').replace('{TileCol}', '{x}');
  const first = entries[0];
  if (first) {
    const prefix = first[1].slice(0, first[1].length - first[0].length);
    if (entries.every(([z, id]) => id === prefix + z)) return template.replace('{TileMatrix}', `${prefix}{z}`);
  }
  return protocolTileUrl(WMTS_PROTOCOL, { t: template, m: JSON.stringify(src.matrices) });
}

/** The tile URL a matrix protocol address stands for. */
export function resolveWmtsTile(url: string): string {
  const { z, x, y, params } = parseProtocolTile(url);
  const matrices = JSON.parse(params.get('m') ?? '{}') as Record<string, string>;
  const id = matrices[z];
  if (id === undefined) throw new Error(`The tile matrix set has no zoom ${z}`);
  return (params.get('t') ?? '').replace('{TileMatrix}', id).replace('{x}', String(x)).replace('{y}', String(y));
}

const POLYGON = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]] as const;
const LINE = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]] as const;
const POINT = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]] as const;

/** Share of a polygon's fill against its outline, so what lies below stays readable. */
const FILL_SHARE = 0.25;

/** Features drawn in the layer's colour: polygons filled and outlined, lines, and points as dots. */
function vector(layer: Layer, source: SourceSpecification, sourceLayer?: string): Fragment {
  const color = layerColor(layer);
  const base = { source: layer.id, ...(sourceLayer && { 'source-layer': sourceLayer }), ...zoomRange(layer) };
  const opacity = layer.opacity;
  return {
    sources: { [layer.id]: source },
    layers: [
      {
        ...base,
        id: `${layer.id}/fill`,
        type: 'fill',
        filter: POLYGON as never,
        paint: { 'fill-color': color, 'fill-opacity': FILL_SHARE * opacity },
      },
      {
        ...base,
        id: `${layer.id}/outline`,
        type: 'line',
        filter: POLYGON as never,
        paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': opacity },
      },
      {
        ...base,
        id: `${layer.id}/line`,
        type: 'line',
        filter: LINE as never,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 2.5, 'line-opacity': opacity },
      },
      {
        ...base,
        id: `${layer.id}/point`,
        type: 'circle',
        filter: POINT as never,
        paint: {
          'circle-color': color,
          'circle-radius': 5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': opacity,
          'circle-stroke-opacity': opacity,
        },
      },
    ],
  };
}

/**
 * A fetched MapLibre style as part of the map: ids prefixed with the layer's, URLs made
 * absolute, the layer's opacity and zoom range applied to each of its layers.
 */
function fromStyle(layer: Layer, style: StyleSpecification, styleUrl: string): Fragment {
  const prefix = `${layer.id}/`;
  const sources: Record<string, SourceSpecification> = {};
  for (const [id, source] of Object.entries(style.sources)) sources[prefix + id] = absoluteSource(source, styleUrl);
  const sprite = typeof style.sprite === 'string' ? resolveUrl(style.sprite, styleUrl) : style.sprite;
  return {
    sources,
    layers: style.layers.flatMap((sub) => {
      const minzoom = Math.max(sub.minzoom ?? MIN_ZOOM, layer.minzoom);
      const maxzoom = Math.min(sub.maxzoom ?? MAX_ZOOM, layer.maxzoom);
      if (minzoom >= maxzoom) return [];
      const adjusted = scaleLayerOpacity(
        {
          ...sub,
          id: prefix + sub.id,
          ...('source' in sub && typeof sub.source === 'string' && { source: prefix + sub.source }),
          ...(minzoom > MIN_ZOOM ? { minzoom } : { minzoom: undefined }),
          ...(maxzoom < MAX_ZOOM ? { maxzoom } : { maxzoom: undefined }),
        } as LayerSpecification,
        layer.opacity,
      );
      return [stripUndefined(adjusted)];
    }),
    ...(style.glyphs && { glyphs: resolveUrl(style.glyphs, styleUrl) }),
    ...(sprite && { sprite }),
  };
}

/** A style's layers with their image references pointed at its sprite added under `spriteId`. */
export function withSpriteId(fragmentLayers: LayerSpecification[], spriteId: string): LayerSpecification[] {
  return fragmentLayers.map((sub) => {
    const layout = sub.layout as Record<string, unknown> | undefined;
    const paint = sub.paint as Record<string, unknown> | undefined;
    const next = { ...sub } as { layout?: Record<string, unknown>; paint?: Record<string, unknown> };
    if (layout && 'icon-image' in layout) next.layout = { ...layout, 'icon-image': prefixImage(layout['icon-image'], spriteId) };
    if (paint) {
      for (const key of Object.keys(paint)) {
        if (key.endsWith('-pattern')) next.paint = { ...(next.paint ?? paint), [key]: prefixImage(paint[key], spriteId) };
      }
    }
    return next as LayerSpecification;
  });
}

function absoluteSource(source: SourceSpecification, base: string): SourceSpecification {
  const next = { ...source } as Record<string, unknown>;
  if (typeof next.url === 'string') next.url = resolveUrl(next.url, base);
  if (Array.isArray(next.tiles)) next.tiles = (next.tiles as string[]).map((t) => resolveUrl(t, base));
  if (typeof next.data === 'string') next.data = resolveUrl(next.data, base);
  return next as unknown as SourceSpecification;
}

const TILED_SOURCES = new Set(['vector', 'raster', 'raster-dem']);

/**
 * A tiled source requesting tiles within the focus area only: its own bounds narrowed to
 * the area, or the area's. Bounds in the style take precedence over those of a TileJSON
 * (COGs, the sources of styles), so a source whose tile set ends inside the area may be
 * asked for tiles beyond its end. GeoJSON and images are single files, left as they are.
 */
function withinFocus(source: SourceSpecification, focus: Bounds | undefined): SourceSpecification {
  if (!focus || !TILED_SOURCES.has(source.type)) return source;
  const own = 'bounds' in source ? source.bounds : undefined;
  return { ...source, bounds: (own && intersectBounds(own, focus)) ?? focus } as SourceSpecification;
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The paint properties that set a layer type's opacity; hillshade has none. */
const OPACITY_PROPERTIES: Record<string, string[]> = {
  background: ['background-opacity'],
  fill: ['fill-opacity'],
  line: ['line-opacity'],
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['icon-opacity', 'text-opacity'],
  raster: ['raster-opacity'],
  'fill-extrusion': ['fill-extrusion-opacity'],
  heatmap: ['heatmap-opacity'],
  'color-relief': ['color-relief-opacity'],
};

/** A style layer with each of its opacities multiplied by `factor`. */
export function scaleLayerOpacity(layer: LayerSpecification, factor: number): LayerSpecification {
  const properties = OPACITY_PROPERTIES[layer.type];
  if (factor === 1 || !properties) return layer;
  const paint = { ...(layer.paint as Record<string, unknown> | undefined) };
  for (const property of properties) paint[property] = scaleOpacity(paint[property], factor);
  return { ...layer, paint } as LayerSpecification;
}

/**
 * An opacity value multiplied by `factor`: a number, a legacy function or an expression.
 * Zoom expressions must stay at the top of the value, so the outputs of a top-level
 * interpolate or step are scaled instead of wrapping it.
 */
export function scaleOpacity(value: unknown, factor: number): unknown {
  if (value === undefined) return factor;
  if (typeof value === 'number') return value * factor;
  if (Array.isArray(value)) {
    const op = value[0] as unknown;
    if (op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') {
      return value.map((v, i) => (i >= 4 && i % 2 === 0 ? scaleOpacity(v, factor) : v));
    }
    if (op === 'step') return value.map((v, i) => (i >= 2 && i % 2 === 0 ? scaleOpacity(v, factor) : v));
    return ['*', value, factor];
  }
  if (isLegacyFunction(value)) return mapLegacyFunction(value, (v) => scaleOpacity(v, factor));
  return value;
}

/** An image reference pointed at the sprite added under `spriteId`. */
export function prefixImage(value: unknown, spriteId: string): unknown {
  if (typeof value === 'string') return value === '' ? value : `${spriteId}:${value}`;
  if (Array.isArray(value)) {
    if (value[0] === 'step') return value.map((v, i) => (i >= 2 && i % 2 === 0 ? prefixImage(v, spriteId) : v));
    return containsImageOperator(value) ? prefixImageOperators(value, spriteId) : ['concat', `${spriteId}:`, value];
  }
  if (isLegacyFunction(value)) return mapLegacyFunction(value, (v) => prefixImage(v, spriteId));
  return value;
}

function containsImageOperator(value: unknown): boolean {
  return Array.isArray(value) && (value[0] === 'image' || value.some(containsImageOperator));
}

function prefixImageOperators(value: unknown, spriteId: string): unknown {
  if (!Array.isArray(value)) return value;
  if (value[0] === 'image') return ['image', prefixImage(value[1], spriteId), ...value.slice(2)];
  return value.map((v) => prefixImageOperators(v, spriteId));
}

interface LegacyFunction {
  stops: [unknown, unknown][];
  default?: unknown;
}

function isLegacyFunction(value: unknown): value is LegacyFunction {
  return typeof value === 'object' && value !== null && Array.isArray((value as LegacyFunction).stops);
}

function mapLegacyFunction(fn: LegacyFunction, map: (value: unknown) => unknown): LegacyFunction {
  return {
    ...fn,
    stops: fn.stops.map(([input, output]) => [input, map(output)]),
    ...('default' in fn && { default: map(fn.default) }),
  };
}
