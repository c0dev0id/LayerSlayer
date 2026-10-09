import type { StyleSpecification } from 'maplibre-gl';
import { DYNAMIC_TILE_SIZE } from '../map/compose';
import { getParam, parsePmtilesUrl } from '../map/urls';
import { isRaster, isVector, type LayerSource } from '../model/layer';
import { loadStyle } from '../services/style';
import type { ServiceInfo } from '../services/types';
import type { LibraryEntry, ServiceEntry } from './library';

/** Technical facts about a library entry's data, for its info: what it is and how it is fetched. */

export type DataKind = 'raster' | 'vector';

export interface SourceFacts {
  data: DataKind[];
  /** The format and how it is asked for, e.g. "PNG images, 256 px tiles". */
  format: string;
  /** The protocol version spoken, where the service has versions (WMS, WFS). */
  version?: string;
}

const IMAGE_FORMATS: Record<string, string> = { png: 'PNG', png8: 'PNG', png24: 'PNG', png32: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', webp: 'WebP', avif: 'AVIF' };

/** The image format a tile address names, by a FORMAT parameter (image/png) or its extension; undefined where it names none. */
export function imageFormat(url: string): string | undefined {
  const named = getParam(url, 'FORMAT')?.split('/').pop() ?? /\.(\w+)$/.exec(url.split(/[?#]/)[0]!)?.[1];
  return named && IMAGE_FORMATS[named.toLowerCase()];
}

/** Tiles from a PMTiles archive are read by range requests from the one file. */
const archive = (tiles: readonly string[]) => (parsePmtilesUrl(tiles[0]!) ? ' from a PMTiles archive' : '');

/** In the browser, feature query answers are cut into vector tiles. */
const CUT = 'made into vector tiles in the browser';

/** How a source's data is fetched, and in what format and version. */
function formatOf(source: LayerSource): Omit<SourceFacts, 'data'> {
  switch (source.type) {
    case 'xyz':
      return { format: `${imageFormat(source.tiles[0]!) ?? 'Image'} tiles${archive(source.tiles)}, ${source.tileSize} px` };
    case 'wmts':
      return { format: `${imageFormat(source.template) ?? 'Image'} tiles, ${source.tileSize} px` };
    case 'wms':
      return { format: `${source.format} by GetMap, ${DYNAMIC_TILE_SIZE} px per tile`, version: source.version };
    case 'arcgis-map':
      return { format: `${source.format} by export, ${DYNAMIC_TILE_SIZE} px per tile` };
    case 'cog':
      return { format: 'GeoTIFF, read in tiles by range requests' };
    case 'image':
      return { format: 'Picture placed by its corners' };
    case 'vector-tiles':
      return { format: `Mapbox Vector Tiles (MVT)${archive(source.tiles)}` };
    case 'arcgis-features':
      return { format: `GeoJSON by ${source.tileQueries ? 'tile query' : 'query'} per tile, ${CUT}` };
    case 'wfs':
      return { format: `GeoJSON (${source.outputFormat}) by GetFeature per tile, ${CUT}`, version: source.version };
    case 'ogc-features':
      return { format: `GeoJSON items per tile, ${CUT}` };
    case 'geojson':
      return { format: 'GeoJSON, loaded whole' };
    case 'style':
      return { format: 'MapLibre style' };
  }
}

/** What kind of data a source holds, as SOURCE_KINDS says, and how it is fetched. */
export function sourceFacts(source: LayerSource): SourceFacts {
  const data: DataKind[] = isRaster(source) ? ['raster'] : isVector(source) ? ['vector'] : [];
  return { data, ...formatOf(source) };
}

const SOURCE_DATA: Record<string, DataKind | undefined> = { vector: 'vector', geojson: 'vector', raster: 'raster', 'raster-dem': 'raster', image: 'raster' };
const SOURCE_FORMAT: Record<string, string> = {
  vector: 'vector tiles (MVT)',
  geojson: 'GeoJSON',
  raster: 'raster tiles',
  'raster-dem': 'elevation tiles',
  image: 'picture',
  video: 'video',
};

/** What a MapLibre style draws: the kinds of its sources. */
export function styleFacts(style: StyleSpecification): SourceFacts {
  const types = [...new Set(Object.values(style.sources).map((s) => s.type))];
  const data = [...new Set(types.map((t) => SOURCE_DATA[t]).filter((d): d is DataKind => d !== undefined))];
  return { data, format: `MapLibre style with ${types.map((t) => SOURCE_FORMAT[t] ?? t).join(', ') || 'no sources'}` };
}

export interface ServiceFacts {
  data: DataKind[];
  /** The distinct formats of its layers. */
  formats: string[];
  version?: string;
  /** How many layers it offers to add. */
  layers: number;
}

/** What the layers a service offers have in common or not; `facts` reads one layer's source. */
export function serviceFacts(info: ServiceInfo): ServiceFacts {
  const all = info.offers.flatMap((o) => (o.draft ? [sourceFacts(o.draft.source)] : []));
  const data = (['raster', 'vector'] as const).filter((kind) => all.some((f) => f.data.includes(kind)));
  const version = all.find((f) => f.version)?.version;
  return { data, formats: [...new Set(all.map((f) => f.format))], ...(version && { version }), layers: all.length };
}

/**
 * The facts of an entry: none for a file; a style's from its sources, as the style is one
 * layer; a service's from the layers `read` finds it offering.
 */
export async function entryFacts(entry: LibraryEntry, read: (entry: ServiceEntry) => Promise<ServiceInfo>): Promise<ServiceFacts | undefined> {
  if (entry.type === 'file') return undefined;
  if (entry.type === 'style') {
    const { data, format } = styleFacts(await loadStyle(entry.url));
    return { data, formats: [format], layers: 1 };
  }
  return serviceFacts(await read(entry));
}

/** "Raster", "Vector" or "Raster and vector". */
export function dataLabel(data: readonly DataKind[]): string {
  const text = data.join(' and ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
