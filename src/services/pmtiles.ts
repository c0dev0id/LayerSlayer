import { FetchSource, PMTiles, SharedPromiseCache, TileType, type Header, type RangeResponse, type Source } from 'pmtiles';
import { boxBounds, tileAt } from '../geo/mercator';
import { parsePmtilesUrl, pmtilesTiles } from '../map/urls';
import type { XyzSource } from '../model/layer';
import { requestUrl, statusMessage, unreachableMessage } from '../state/net';
import type { ServiceInfo } from './types';
import { parseTileJson, type TileJson } from './vectorTiles';

/**
 * A PMTiles archive read by range requests, through the CORS proxy where its host needs it.
 * The pmtiles library does the reading; requests that fail become readable errors.
 */
class RemoteArchive implements Source {
  readonly #fetch: FetchSource;

  constructor(readonly url: string) {
    this.#fetch = new FetchSource(requestUrl(url));
  }

  /** The address requested, which keys its headers and directories in the cache, failures included. */
  getKey(): string {
    return this.#fetch.getKey();
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    try {
      return await this.#fetch.getBytes(offset, length, signal, etag);
    } catch (error) {
      // fetch fails with a TypeError when the server is unreachable or CORS forbids reading it.
      if (error instanceof TypeError) throw new Error(unreachableMessage(this.url), { cause: error });
      const status = /^Bad response code: (\d+)$/.exec((error as Error).message)?.[1];
      if (status) throw new Error(statusMessage(requestUrl(this.url), Number(status), ''), { cause: error });
      throw error;
    }
  }
}

/**
 * The open archives by the address they are requested from, so that a host routed through
 * the proxy later is read anew. Their headers and directories share one cache of a bounded
 * size, so archives no longer drawn do not keep theirs.
 */
const archives = new Map<string, PMTiles>();
const directories = new SharedPromiseCache();

function archive(url: string): PMTiles {
  const key = requestUrl(url);
  let found = archives.get(key);
  if (!found) archives.set(key, (found = new PMTiles(new RemoteArchive(url), directories)));
  return found;
}

/**
 * A tile of an archive; a tile the archive does not hold is empty, which the map draws as
 * nothing, so that sparse archives show no errors.
 */
export async function pmtilesTile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const parsed = parsePmtilesUrl(url);
  if (!parsed?.tile) throw new Error(`Not a PMTiles tile address: ${url}`);
  const found = await archive(parsed.archive).getZxy(...parsed.tile, signal);
  return found?.data ?? new ArrayBuffer(0);
}

/** The TileJSON of an archive, which MapLibre styles written for PMTiles ask for. */
export async function pmtilesTileJson(url: string): Promise<object> {
  const parsed = parsePmtilesUrl(url);
  if (!parsed || parsed.tile) throw new Error(`Not a PMTiles archive address: ${url}`);
  return (await archive(parsed.archive).getTileJson(url)) as object;
}

/** What the map uses of an archive's metadata, which tools such as tippecanoe write as in a TileJSON. */
type Metadata = Pick<TileJson, 'attribution' | 'vector_layers'>;

/** Image tiles the map can draw. */
const IMAGE_TILES = new Set([TileType.Png, TileType.Jpeg, TileType.Webp, TileType.Avif]);

/** The tile size taken for image tiles whose size cannot be read. */
const DEFAULT_TILE_SIZE = 256;

/**
 * A PMTiles archive: vector tiles offered by their tile layers, as a TileJSON's are; image
 * tiles as one raster layer of `tileSize` pixel tiles. Archive names in the metadata are
 * often the paths of the files they were made from, so the layers are named by `title`.
 */
export function describePmtiles(url: string, title: string, header: Header, metadata: Metadata, tileSize = DEFAULT_TILE_SIZE): ServiceInfo {
  const tiles = [pmtilesTiles(url)];
  const zooms = { minzoom: header.minZoom, maxzoom: header.maxZoom };
  const box = [header.minLon, header.minLat, header.maxLon, header.maxLat];
  const attribution = metadata.attribution || undefined;
  if (header.tileType === TileType.Mvt) {
    if (!Array.isArray(metadata.vector_layers) || metadata.vector_layers.length === 0) {
      throw new Error('This PMTiles archive holds vector tiles but lists no vector layers in its metadata.');
    }
    return parseTileJson({ name: title, tiles, ...zooms, bounds: box, vector_layers: metadata.vector_layers, ...(attribution && { attribution }) }, url);
  }
  if (IMAGE_TILES.has(header.tileType)) {
    const source: XyzSource = { type: 'xyz', tiles, scheme: 'xyz', tileSize, ...zooms };
    const bounds = boxBounds(box);
    return { title, offers: [{ title, depth: 0, draft: { name: title, source, ...(bounds && { bounds }), ...(attribution && { attribution }) } }] };
  }
  const kind = header.tileType === TileType.Mlt ? 'MapLibre Tiles (MLT)' : 'tiles of an unknown kind';
  throw new Error(`This PMTiles archive holds ${kind}, which Layer Slayer does not draw.`);
}

/** The pixel size of an archive's image tiles, read from the tile at its centre at its lowest zoom. */
async function imageTileSize(pmtiles: PMTiles, header: Header): Promise<number> {
  const { x, y } = tileAt(header.centerLon, header.centerLat, header.minZoom);
  const tile = await pmtiles.getZxy(header.minZoom, x, y);
  if (!tile) return DEFAULT_TILE_SIZE;
  const image = await createImageBitmap(new Blob([tile.data])).catch(() => undefined);
  const size = image?.width ?? DEFAULT_TILE_SIZE;
  image?.close();
  return size;
}

/** Reads what a PMTiles archive holds from its header and metadata. */
export async function readPmtiles(url: string, title: string): Promise<ServiceInfo> {
  const pmtiles = archive(url);
  const header = await pmtiles.getHeader();
  const [metadata, tileSize] = await Promise.all([
    pmtiles.getMetadata() as Promise<Metadata | undefined>,
    IMAGE_TILES.has(header.tileType) ? imageTileSize(pmtiles, header) : undefined,
  ]);
  return describePmtiles(url, title, header, metadata ?? {}, tileSize);
}
