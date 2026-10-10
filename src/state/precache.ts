import { createStore } from 'solid-js/store';
import { bulkPolicy, type BulkPolicy } from '../map/bulkPolicies';
import { layerSource } from '../map/compose';
import { FEATURE_PROTOCOL } from '../map/featureTiles';
import { tileThroughCache } from '../map/protocols';
import { countTiles, coveringTiles, sourceTileZoom, spreadTiles, tileUrl, type TileId } from '../map/tileGrid';
import { PMTILES_PROTOCOL } from '../map/urls';
import { keepsTiles, type Bounds, type Layer } from '../model/layer';
import type { LngLat } from '../model/route';
import { requestPersistentStorage } from './files';
import { errorMessage } from './net';
import { layerHost } from './store';
import { map } from './ui';

/**
 * Precaching: the tiles of chosen layers within the focus area, at chosen zooms, fetched
 * ahead and kept until the cache is cleared, so that slow servers need not be waited for
 * later. Tiles are asked for one at a time with a pause between them, longer at servers
 * whose operators ask for restraint; servers that forbid it are left out.
 */

/** The pause after each tile fetched, and at servers fetched slowly. */
export const PAUSE_MS = 100;
export const SLOW_PAUSE_MS = 500;

/** Tile sizes are estimated from this many tiles of each layer and zoom. */
const SAMPLES = 3;

/** A run stops after this many tiles in a row failed: the server is down or refuses. */
const MAX_FAILURES_IN_A_ROW = 20;

/** The tiles of a layer as the map asks for them. */
export interface TileSource {
  templates: string[];
  /** How the map reads its tiles: raster tiles must be images. */
  type: 'image' | 'arrayBuffer';
  tileSize: number;
  scheme: 'xyz' | 'tms';
  minzoom: number;
  maxzoom: number;
  bounds?: Bounds;
}

/**
 * The tiles a layer can be precached from, as the map is given them, or why it cannot be:
 * it is not drawn from tiles, its tiles come from an archive or a feature query, or it
 * keeps none.
 */
export function tileSource(layer: Layer): TileSource | string {
  const spec = layerSource(layer);
  if (!spec || (spec.type !== 'raster' && spec.type !== 'vector') || !spec.tiles?.length) return 'is not drawn from tiles';
  if (spec.tiles.some((t) => t.startsWith(`${PMTILES_PROTOCOL}://`))) return 'is a PMTiles archive, which is not precached';
  if (spec.tiles.some((t) => t.startsWith(`${FEATURE_PROTOCOL}://`))) return 'is queried for features, which are not precached';
  if (!keepsTiles(layer)) return 'keeps no tiles (switched off in its settings)';
  return {
    templates: spec.tiles,
    type: spec.type === 'raster' ? 'image' : 'arrayBuffer',
    // MapLibre's defaults where the style gives none.
    tileSize: (spec.type === 'raster' && spec.tileSize) || 512,
    scheme: spec.scheme ?? 'xyz',
    minzoom: spec.minzoom ?? 0,
    maxzoom: spec.maxzoom ?? 22,
    ...(spec.bounds && { bounds: spec.bounds as Bounds }),
  };
}

/**
 * The tile zooms a source is asked for at the whole map zooms `from` to `to` where the layer
 * is drawn, with the first map zoom of each; beyond its deepest zoom the map enlarges
 * those tiles, so they are the ones kept.
 */
export function tileZooms(source: TileSource, layer: Pick<Layer, 'minzoom' | 'maxzoom'>, from: number, to: number): { mapZoom: number; z: number }[] {
  const zooms = new Map<number, number>();
  for (let mapZoom = from; mapZoom <= to; mapZoom++) {
    if (mapZoom + 1 <= layer.minzoom || mapZoom >= layer.maxzoom) continue;
    const z = Math.min(sourceTileZoom(mapZoom, source.tileSize), source.maxzoom);
    if (z >= source.minzoom && !zooms.has(z)) zooms.set(z, mapZoom);
  }
  return [...zooms].map(([z, mapZoom]) => ({ mapZoom, z }));
}

export type LayerChoice = 'open' | 'visible' | 'all';

/** The layers a choice means: the one whose settings are open, those shown, or all. */
export function chosenLayers(choice: LayerChoice, layers: readonly Layer[], openId: string | undefined): Layer[] {
  if (choice === 'open') return layers.filter((l) => l.id === openId);
  return choice === 'visible' ? layers.filter((l) => l.visible) : [...layers];
}

/** A layer as precaching sees it: its tiles, how many at each zoom and its server's policy, or why it is left out. */
export type PlannedLayer =
  | { layer: Layer; reason: string; source?: undefined; policy?: undefined }
  | { layer: Layer; reason?: undefined; source: TileSource; policy?: BulkPolicy; zooms: { mapZoom: number; z: number; count: number }[] };

export function planPrecache(layers: readonly Layer[], area: readonly LngLat[], from: number, to: number): PlannedLayer[] {
  return layers.map((layer) => {
    const source = tileSource(layer);
    if (typeof source === 'string') return { layer, reason: source };
    const policy = bulkPolicy(layerHost(layer));
    const zooms = tileZooms(source, layer, from, to).map((zoom) => ({ ...zoom, count: countTiles(area, zoom.z, source.bounds) }));
    return { layer, source, zooms, ...(policy && { policy }) };
  });
}

/** A source's tiles at one zoom, first asked for at map zoom `mapZoom`, with the pause after each fetched. */
export interface PrecacheJob {
  source: TileSource;
  mapZoom: number;
  z: number;
  count: number;
  pause: number;
}

/** The pixel ratio the map fills `{ratio}` with. */
const pixelRatio = () => map()?.getPixelRatio() ?? globalThis.devicePixelRatio ?? 1;

const urlOf = (source: TileSource, tile: TileId) => tileUrl(source.templates, tile, source.scheme, pixelRatio());

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/** Sizes of sampled tiles by source and zoom, kept while the page is open; empty where no sample could be read. */
const [sampleSizes, setSampleSizes] = createStore<Record<string, number[]>>({});
const sampleKey = (source: TileSource, z: number) => `${source.templates[0]}|${z}`;

/** The estimated size of `count` tiles of a source at a zoom, once tiles of it have been sampled. */
export function estimatedBytes(source: TileSource, z: number, count: number): number | undefined {
  const sizes = sampleSizes[sampleKey(source, z)];
  return sizes?.length ? (count * sizes.reduce((a, b) => a + b, 0)) / sizes.length : undefined;
}

/** Whether a source's tiles at a zoom have been sampled, successfully or not. */
export const sampled = (source: TileSource, z: number) => sampleSizes[sampleKey(source, z)] !== undefined;

/**
 * Samples the sizes of the jobs' tiles, zoom by zoom, from the cache where it has them and
 * otherwise from their servers, one tile at a time with the jobs' pauses. Fetched samples
 * are kept like tiles the map loads.
 */
export async function sampleTiles(jobs: readonly PrecacheJob[], area: readonly LngLat[], signal: AbortSignal): Promise<void> {
  for (const { source, z, count, pause } of jobs) {
    if (!Number.isFinite(count) || count === 0 || sampled(source, z)) continue;
    const sizes: number[] = [];
    for (const tile of spreadTiles(area, z, source.bounds, SAMPLES)) {
      signal.throwIfAborted();
      try {
        const sample = await tileThroughCache(urlOf(source, tile), source.type, signal);
        sizes.push(sample.bytes);
        if (!sample.fetched) continue;
      } catch (error) {
        if (signal.aborted) throw error;
      }
      await sleep(pause, signal);
    }
    setSampleSizes(sampleKey(source, z), sizes);
  }
}

/** What precaching is doing, for the focus area section. */
export interface PrecacheRun {
  status: 'running' | 'paused' | 'done' | 'stopped' | 'cancelled';
  /** Tiles in the area at the chosen zooms, and those dealt with so far. */
  total: number;
  done: number;
  /** Of those: fetched, kept already, missing on the server, failed. */
  fetched: number;
  kept: number;
  missing: number;
  failed: number;
  /** Size of the tiles fetched. */
  bytes: number;
  /** Over the last tiles fetched, while running. */
  tilesPerSecond: number;
  bytesPerSecond: number;
  lastError?: string;
}

const [store, setStore] = createStore<{ run?: PrecacheRun }>({});

/** The precache run of this page, if one was started; it is not kept across reloads. */
export const precacheRun = () => store.run;

/** Whether a run is going on, paused or not. */
export const precacheActive = () => store.run?.status === 'running' || store.run?.status === 'paused';

let controller: AbortController | undefined;
let resume: (() => void) | undefined;

/** Recent fetches, for the rates shown. */
const RATE_WINDOW_MS = 20_000;

/** How often the numbers shown are brought up to date while running. */
const SHOW_EVERY_MS = 200;

/**
 * Fetches and keeps the jobs' tiles in the area until done, cancelled or stopped by
 * failures. A tile kept for a day already is kept for good without fetching it again.
 */
export async function startPrecache(jobs: readonly PrecacheJob[], area: readonly LngLat[]): Promise<void> {
  controller?.abort();
  const own = (controller = new AbortController());
  const signal = own.signal;
  const counts: Omit<PrecacheRun, 'status'> = { total: jobs.reduce((sum, job) => sum + job.count, 0), done: 0, fetched: 0, kept: 0, missing: 0, failed: 0, bytes: 0, tilesPerSecond: 0, bytesPerSecond: 0 };
  setStore('run', { status: 'running', ...counts });
  requestPersistentStorage();
  let shownAt = 0;
  /** Shows the numbers counted, at once or at most every few hundred milliseconds. */
  const show = (now = false) => {
    if (!now && Date.now() - shownAt < SHOW_EVERY_MS) return;
    shownAt = Date.now();
    setStore('run', { ...counts });
  };
  const end = (status: PrecacheRun['status']) => {
    show(true);
    setStore('run', 'status', status);
  };
  // Fetches within the rate window, and the bytes of all but the first of them.
  const recent: { at: number; bytes: number }[] = [];
  let recentBytes = 0;
  const countFetched = (bytes: number) => {
    const at = Date.now();
    if (recent.length) recentBytes += bytes;
    recent.push({ at, bytes });
    while (recent.length > 1 && at - recent[0]!.at > RATE_WINDOW_MS) {
      recent.shift();
      recentBytes -= recent[0]!.bytes;
    }
    const seconds = (at - recent[0]!.at) / 1000;
    counts.fetched++;
    counts.bytes += bytes;
    counts.tilesPerSecond = seconds && (recent.length - 1) / seconds;
    counts.bytesPerSecond = seconds && recentBytes / seconds;
  };
  let failuresInARow = 0;
  try {
    for (const { source, z, pause } of jobs) {
      for (const tile of coveringTiles(area, z, source.bounds)) {
        if (store.run?.status === 'paused') show(true);
        while (store.run?.status === 'paused' && !signal.aborted) await new Promise<void>((done) => (resume = done));
        signal.throwIfAborted();
        let fetched = false;
        try {
          const kept = await tileThroughCache(urlOf(source, tile), source.type, signal, true);
          failuresInARow = 0;
          fetched = kept.fetched;
          if (fetched) countFetched(kept.bytes);
          else counts.kept++;
        } catch (error) {
          if (signal.aborted) throw error;
          const status = (error as { status?: number }).status;
          if (status === 404 || status === 204) {
            counts.missing++;
          } else {
            failuresInARow++;
            counts.failed++;
            counts.lastError = errorMessage(error);
          }
          fetched = true;
        }
        counts.done++;
        if (failuresInARow >= MAX_FAILURES_IN_A_ROW) return end('stopped');
        show();
        if (fetched) await sleep(pause, signal);
      }
    }
    end('done');
  } catch {
    if (controller === own) end('cancelled');
  }
}

export function pausePrecache(): void {
  if (store.run?.status === 'running') setStore('run', 'status', 'paused');
}

export function resumePrecache(): void {
  if (store.run?.status !== 'paused') return;
  setStore('run', 'status', 'running');
  resume?.();
}

export function cancelPrecache(): void {
  controller?.abort();
  resume?.();
}

/** Forgets a run that has ended, and its numbers with it. */
export function dismissPrecache(): void {
  if (store.run && !precacheActive()) setStore('run', undefined);
}
