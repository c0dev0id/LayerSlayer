import { createStore } from 'solid-js/store';
import { bulkPolicy, type BulkPolicy } from '../map/bulkPolicies';
import { composeStyle } from '../map/compose';
import { FEATURE_PROTOCOL } from '../map/featureTiles';
import { cacheKey, loadTileData } from '../map/protocols';
import { keptTile, storeTile } from '../map/tileCache';
import { countTiles, coveringTiles, tileUrl, tileZoom, type TileId } from '../map/tileGrid';
import { PMTILES_PROTOCOL } from '../map/urls';
import type { Bounds, Layer } from '../model/layer';
import type { LngLat } from '../model/route';
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
 * The tiles a layer can be precached from, read from the style the map is given, or why it
 * cannot be: it is not drawn from tiles, its tiles come from an archive or a feature query,
 * or it keeps none.
 */
export function tileSource(layer: Layer): TileSource | string {
  const spec = composeStyle([layer], new Map(), { tileCache: false }).sources[layer.id];
  if (!spec || (spec.type !== 'raster' && spec.type !== 'vector') || !spec.tiles?.length) return 'is not drawn from tiles';
  if (spec.tiles.some((t) => t.startsWith(`${PMTILES_PROTOCOL}://`))) return 'is a PMTiles archive, which is not precached';
  if (spec.tiles.some((t) => t.startsWith(`${FEATURE_PROTOCOL}://`))) return 'is queried for features, which are not precached';
  if (layer.cache === false) return 'keeps no tiles (switched off in its settings)';
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
    const z = Math.min(tileZoom(mapZoom, source.tileSize), source.maxzoom);
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

/** A layer as precaching sees it: its tiles and how many at each zoom, or why it is left out. */
export interface PlannedLayer {
  layer: Layer;
  source?: TileSource;
  reason?: string;
  policy?: BulkPolicy;
  zooms: { mapZoom: number; z: number; count: number }[];
}

export function planPrecache(layers: readonly Layer[], area: readonly LngLat[], from: number, to: number): PlannedLayer[] {
  return layers.map((layer) => {
    const source = tileSource(layer);
    if (typeof source === 'string') return { layer, reason: source, zooms: [] };
    const policy = bulkPolicy(layerHost(layer));
    const zooms = tileZooms(source, layer, from, to).map((zoom) => ({ ...zoom, count: countTiles(area, zoom.z, source.bounds) }));
    return { layer, source, zooms, ...(policy && { policy }) };
  });
}

/** The pixel ratio the map fills `{ratio}` with. */
const pixelRatio = () => map()?.getPixelRatio() ?? globalThis.devicePixelRatio ?? 1;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

/** Sizes of sampled tiles by source and zoom, kept while the page is open; empty where no sample could be read. */
const sampleSizes = new Map<string, number[]>();
const sampleKey = (source: TileSource, z: number) => `${source.templates[0]}|${z}`;

/** The estimated size of `count` tiles of a source at a zoom, once tiles of it have been sampled. */
export function estimatedBytes(source: TileSource, z: number, count: number): number | undefined {
  const sizes = sampleSizes.get(sampleKey(source, z));
  return sizes?.length ? (count * sizes.reduce((a, b) => a + b, 0)) / sizes.length : undefined;
}

/** Whether a source's tiles at a zoom have been sampled, successfully or not. */
export const sampled = (source: TileSource, z: number) => sampleSizes.has(sampleKey(source, z));

/** Up to `k` tiles spread evenly over the area's tiles at a zoom. */
function spreadTiles(area: readonly LngLat[], z: number, bounds: Bounds | undefined, count: number, k: number): TileId[] {
  const wanted = new Set(Array.from({ length: Math.min(k, count) }, (_, i) => Math.floor(((i + 0.5) * count) / Math.min(k, count))));
  const picked: TileId[] = [];
  let index = 0;
  for (const tile of coveringTiles(area, z, bounds)) {
    if (wanted.has(index++)) picked.push(tile);
    if (picked.length === wanted.size) break;
  }
  return picked;
}

/**
 * Samples the sizes of tiles of the planned layers not left out, zoom by zoom, from the
 * cache where it has them and otherwise from their servers, one tile at a time with the
 * same pauses as a run. Fetched samples are kept like tiles the map loads.
 */
export async function sampleTiles(plan: readonly PlannedLayer[], area: readonly LngLat[], pauseOf: (planned: PlannedLayer) => number | undefined, onSample: () => void, signal: AbortSignal): Promise<void> {
  for (const planned of plan) {
    const source = planned.source;
    const pause = pauseOf(planned);
    if (!source || pause === undefined) continue;
    for (const { z, count } of planned.zooms) {
      if (!Number.isFinite(count) || count === 0 || sampled(source, z)) continue;
      const sizes: number[] = [];
      for (const tile of spreadTiles(area, z, source.bounds, count, SAMPLES)) {
        signal.throwIfAborted();
        const url = tileUrl(source.templates, tile, source.scheme, pixelRatio());
        const kept = await keptTile(cacheKey(url)).catch(() => undefined);
        if (kept) {
          sizes.push(kept.bytes);
          continue;
        }
        try {
          const data = await loadTileData(url, source.type, signal);
          await storeTile(cacheKey(url), data.slice(0)).catch(() => {});
          sizes.push(data.byteLength);
        } catch (error) {
          if (signal.aborted) throw error;
        }
        await sleep(pause, signal);
      }
      sampleSizes.set(sampleKey(source, z), sizes);
      onSample();
    }
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
  /** Over the last tiles fetched. */
  tilesPerSecond: number;
  bytesPerSecond: number;
  startedAt: number;
  lastError?: string;
}

/** A source's tiles at one zoom, with the pause after each fetched. */
export interface PrecacheJob {
  source: TileSource;
  z: number;
  count: number;
  pause: number;
}

const [store, setStore] = createStore<{ run?: PrecacheRun }>({});

/** The precache run of this page, if one was started; it is not kept across reloads. */
export const precacheRun = () => store.run;

let controller: AbortController | undefined;
let resume: (() => void) | undefined;

/** Recent fetches, for the rates shown. */
const RATE_WINDOW_MS = 20_000;

/**
 * Fetches and keeps the jobs' tiles in the area until done, cancelled or stopped by
 * failures. A tile kept for a day already is kept for good without fetching it again.
 */
export async function startPrecache(jobs: readonly PrecacheJob[], area: readonly LngLat[]): Promise<void> {
  controller?.abort();
  const own = (controller = new AbortController());
  const signal = own.signal;
  const total = jobs.reduce((sum, job) => sum + job.count, 0);
  setStore('run', { status: 'running', total, done: 0, fetched: 0, kept: 0, missing: 0, failed: 0, bytes: 0, tilesPerSecond: 0, bytesPerSecond: 0, startedAt: Date.now() });
  // Asks the browser not to evict the site's storage when space runs short.
  void navigator.storage?.persist?.().catch(() => false);
  const recent: { at: number; bytes: number }[] = [];
  let failuresInARow = 0;
  const update = (patch: (run: PrecacheRun) => Partial<PrecacheRun>) => setStore('run', (run) => (run ? { ...run, ...patch(run) } : run));
  try {
    for (const { source, z, pause } of jobs) {
      for (const tile of coveringTiles(area, z, source.bounds)) {
        while (store.run?.status === 'paused' && !signal.aborted) await new Promise<void>((done) => (resume = done));
        signal.throwIfAborted();
        const url = tileUrl(source.templates, tile, source.scheme, pixelRatio());
        const key = cacheKey(url);
        const kept = await keptTile(key).catch(() => undefined);
        if (kept) {
          if (!kept.always) await storeTile(key, await kept.data(), { always: true });
          update((run) => ({ done: run.done + 1, kept: run.kept + 1 }));
          continue;
        }
        try {
          const data = await loadTileData(url, source.type, signal);
          await storeTile(key, data, { always: true });
          failuresInARow = 0;
          const now = Date.now();
          recent.push({ at: now, bytes: data.byteLength });
          while (recent.length > 1 && now - recent[0]!.at > RATE_WINDOW_MS) recent.shift();
          const seconds = recent.length > 1 ? (now - recent[0]!.at) / 1000 : 0;
          update((run) => ({
            done: run.done + 1,
            fetched: run.fetched + 1,
            bytes: run.bytes + data.byteLength,
            tilesPerSecond: seconds ? (recent.length - 1) / seconds : 0,
            bytesPerSecond: seconds ? recent.slice(1).reduce((sum, r) => sum + r.bytes, 0) / seconds : 0,
          }));
        } catch (error) {
          if (signal.aborted) throw error;
          const status = (error as { status?: number }).status;
          if (status === 404 || status === 204) {
            update((run) => ({ done: run.done + 1, missing: run.missing + 1 }));
          } else {
            failuresInARow++;
            update((run) => ({ done: run.done + 1, failed: run.failed + 1, lastError: errorMessage(error) }));
            if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
              update(() => ({ status: 'stopped', tilesPerSecond: 0, bytesPerSecond: 0 }));
              return;
            }
          }
        }
        await sleep(pause, signal);
      }
    }
    update(() => ({ status: 'done', tilesPerSecond: 0, bytesPerSecond: 0 }));
  } catch {
    if (controller === own) update(() => ({ status: 'cancelled', tilesPerSecond: 0, bytesPerSecond: 0 }));
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
  if (store.run && store.run.status !== 'running' && store.run.status !== 'paused') setStore('run', undefined);
}
