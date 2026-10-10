import { createEffect, createMemo, createRoot } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { cornersBounds } from '../geo/bounds';
import { MAX_LATITUDE } from '../geo/mercator';
import {
  createLayer,
  MAX_ZOOM,
  MIN_ZOOM,
  SOURCE_KINDS,
  storedFile,
  storedFiles,
  type Bounds,
  type Layer,
  type LayerDraft,
  type LayerSource,
} from '../model/layer';
import { isLngLat, type LngLat } from '../model/route';
import { fileSourceType, importFile } from '../services/importFile';
import { deleteFile } from './files';
import { parsePmtilesUrl } from '../map/urls';
import { hostOf, setProxy } from './net';
import { persistedStore } from './persist';

export interface Settings {
  /** CORS proxy address with {url} where the target goes; empty for none. */
  proxy: string;
  /** Hosts whose requests go through the proxy. */
  proxiedHosts: string[];
  /** The colour the map is drawn on, as #rrggbb; none for the page's white. */
  background?: string;
  /** The ground in 3D, raised by its elevation. */
  terrain?: boolean;
  /** No layer keeps tiles, whatever its own setting says: a switch of this browser, for testing. */
  tileCacheOff?: boolean;
  /**
   * Which hosts the CORS proxy is used for: none, or those of all layers as if each had it
   * ticked; by default the hosts chosen for it. A switch of this browser, for testing.
   */
  proxyMode?: Exclude<ProxyMode, 'hosts'>;
}

/** Which hosts the CORS proxy is used for: none, those chosen for it, or those of all layers too. */
export type ProxyMode = 'off' | 'hosts' | 'all';

/** The settings that are this browser's own rather than a project's: the proxy address and the switches. */
type BrowserSettings = Pick<Settings, 'proxy' | 'tileCacheOff' | 'proxyMode'>;

/** This browser's own settings, every one of them, so that they replace those of a project. */
export function browserSettings({ proxy, tileCacheOff, proxyMode }: Settings): BrowserSettings {
  return { proxy, tileCacheOff, proxyMode };
}

/** The settings a project file keeps: all but this browser's own. */
export function projectSettings({ proxy: _, tileCacheOff: __, proxyMode: ___, ...settings }: Settings): Omit<Settings, keyof BrowserSettings> {
  return settings;
}

/** The address a layer's data comes from, for showing and for the proxy setting. */
export function sourceUrl(layer: Layer): string | undefined {
  const source = layer.source;
  switch (source.type) {
    case 'xyz':
    case 'vector-tiles':
      return parsePmtilesUrl(source.tiles[0]!)?.archive ?? source.tiles[0];
    case 'wmts':
      return source.template;
    case 'geojson':
    case 'image':
      return 'url' in source.data ? source.data.url : undefined;
    default:
      return source.url;
  }
}

/** The server a layer's data comes from, which the CORS proxy is chosen for. */
export function layerHost(layer: Layer): string | undefined {
  const url = sourceUrl(layer);
  return url ? hostOf(url) : undefined;
}

/**
 * The hosts requests go through the CORS proxy for: none when it is off, the hosts chosen
 * for it, and with all layers the host of every layer as well. Services the app asks itself
 * (OpenStreetMap queries and details, place search, the sea at a spot) are no layer's.
 */
export function proxiedHostsOf(settings: Settings, layers: readonly Layer[]): string[] {
  if (!settings.proxy || settings.proxyMode === 'off') return [];
  if (settings.proxyMode !== 'all') return settings.proxiedHosts;
  const hosts = layers.map(layerHost).filter((host): host is string => host !== undefined);
  return [...new Set([...settings.proxiedHosts, ...hosts])];
}


export interface View {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface AppState {
  /** Bottom layer first, the order the map draws them in. */
  layers: Layer[];
  /** The layer whose settings are open, under its entry in the list; none when all are closed. */
  activeLayerId?: string;
  settings: Settings;
  view: View;
  /**
   * The corners of the focus area, a polygon. Every layer but the bottom one requests
   * tiles within its bounds only.
   */
  focus?: LngLat[];
}

const STORAGE_KEY = 'layerslayer';

const TOPPLUS = 'https://sgx.geodatenzentrum.de/wmts_topplus_open';

/** What a first visit starts with: TopPlusOpen, as its library entry adds it. */
const FIRST_LAYER: LayerDraft = {
  name: 'TopPlusOpen',
  source: {
    type: 'wmts',
    template: `${TOPPLUS}/tile/1.0.0/web/default/WEBMERCATOR/{TileMatrix}/{TileRow}/{TileCol}.png`,
    // Its tile matrices are named 00 to 18, one per zoom.
    matrices: Object.fromEntries(Array.from({ length: 19 }, (_, z) => [z, String(z).padStart(2, '0')])),
    tileSize: 256,
  },
  bounds: [-180, -MAX_LATITUDE, 180, MAX_LATITUDE],
  attribution: '© <a href="https://www.bkg.bund.de">BKG</a> dl-de/by-2-0, <a href="https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_topplusopen.html">data sources</a>',
  // As if added from its library entry, which then shows it as on the map.
  origin: `${TOPPLUS}/1.0.0/WMTSCapabilities.xml web`,
  // The map a first visit sees, so not see-through like layers added to it.
  opacity: 1,
};

export function defaultState(): AppState {
  const layer = createLayer(FIRST_LAYER, []);
  return {
    layers: [layer],
    activeLayerId: layer.id,
    settings: { proxy: '', proxiedHosts: [] },
    view: { center: [10, 50], zoom: 4, bearing: 0, pitch: 0 },
  };
}

function isLayer(value: unknown): value is Layer {
  const l = value as Layer;
  return (
    typeof l === 'object' &&
    l !== null &&
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    typeof l.visible === 'boolean' &&
    typeof l.opacity === 'number' &&
    typeof l.minzoom === 'number' &&
    typeof l.maxzoom === 'number' &&
    typeof l.source === 'object' &&
    l.source !== null &&
    Object.hasOwn(SOURCE_KINDS, l.source.type)
  );
}

/** A polygon's corners: at least three positions. */
function isPolygon(value: unknown): value is LngLat[] {
  return Array.isArray(value) && value.length >= 3 && value.every(isLngLat);
}

/**
 * Reads stored state. Layers that do not have the current shape are dropped one by one
 * rather than losing the rest; there is no migration of older shapes before version 1.0.
 */
export function parseState(json: string): AppState {
  const stored = JSON.parse(json) as Partial<AppState>;
  const fallback = defaultState();
  const layers = Array.isArray(stored.layers) ? stored.layers.filter(isLayer) : fallback.layers;
  const view = stored.view;
  const settings = stored.settings;
  return {
    layers,
    ...(layers.some((l) => l.id === stored.activeLayerId) && { activeLayerId: stored.activeLayerId }),
    settings: {
      proxy: typeof settings?.proxy === 'string' ? settings.proxy : '',
      proxiedHosts: Array.isArray(settings?.proxiedHosts) ? settings.proxiedHosts.filter((h) => typeof h === 'string') : [],
      ...(typeof settings?.background === 'string' && /^#[0-9a-f]{6}$/i.test(settings.background) && { background: settings.background }),
      ...(settings?.terrain === true && { terrain: true }),
      ...(settings?.tileCacheOff === true && { tileCacheOff: true }),
      ...((settings?.proxyMode === 'off' || settings?.proxyMode === 'all') && { proxyMode: settings.proxyMode }),
    },
    view:
      view && Array.isArray(view.center) && typeof view.zoom === 'number'
        ? { center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0 }
        : fallback.view,
    ...(isPolygon(stored.focus) && { focus: stored.focus }),
  };
}

const [state, setState] = persistedStore(STORAGE_KEY, 'layers', parseState, defaultState);
export { state };

/** The hosts requests go through the CORS proxy for now. */
const proxiedHosts = createRoot(() => createMemo(() => proxiedHostsOf(state.settings, state.layers)));

/** Whether requests to a layer's host go through the CORS proxy now. */
export function proxiesHost(host: string | undefined): boolean {
  return host !== undefined && proxiedHosts().includes(host);
}

createRoot(() => {
  createEffect(() => setProxy(state.settings.proxy, proxiedHosts()));
  // A stored file goes with the last layer that uses it: removed, given other data, or
  // replaced by an opened project.
  let used = storedFiles(state.layers);
  createEffect(() => {
    const now = storedFiles(state.layers);
    for (const file of used) if (!now.has(file)) void deleteFile(file);
    used = now;
  });
});

/** Replaces everything with a project's state, as when it is opened; the proxy and the switches stay this browser's. */
export function replaceState(next: AppState): void {
  setState(reconcile({ ...next, settings: { ...next.settings, ...browserSettings(state.settings) } }, { key: 'id', merge: false }));
}

/** Adds a layer on top of the others and makes it the active one. */
export function addLayer(draft: LayerDraft): Layer {
  const layer = createLayer(draft, state.layers);
  setState('layers', state.layers.length, layer);
  setState('activeLayerId', layer.id);
  return layer;
}

export type LayerSettings = Partial<Pick<Layer, 'name' | 'visible' | 'opacity' | 'minzoom' | 'maxzoom' | 'color' | 'adjust' | 'ownStyle' | 'icon' | 'iconSize' | 'lineWidth' | 'lineDash' | 'label' | 'bounds' | 'cache'>>;

export function updateLayer(id: string, patch: LayerSettings): void {
  if (patch.minzoom !== undefined) patch.minzoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, patch.minzoom));
  if (patch.maxzoom !== undefined) patch.maxzoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, patch.maxzoom));
  setState('layers', (l) => l.id === id, patch);
}

/** Draws a WMS layer with maps of several times at another of them. */
export function setLayerTime(id: string, value: string): void {
  setState('layers', (l) => l.id === id, 'source', (source) =>
    source.type === 'wms' && source.time ? { ...source, time: { ...source.time, value } } : source,
  );
}

/** Gives a layer new data from where it came from, as updating an OSM query does. */
export function replaceLayerSource(id: string, source: LayerSource, bounds: Bounds | undefined): void {
  setState('layers', (l) => l.id === id, { source, bounds });
}

/**
 * Gives a layer made from a file a newer version of it: the layer keeps its settings and
 * origin, and the file it had is deleted with the change. A file of the other kind (a
 * GeoPDF for features, features for a GeoPDF's picture) is turned away.
 */
export async function replaceLayerFile(id: string, file: File): Promise<void> {
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return;
  if (fileSourceType(file, file.name) !== layer.source.type) {
    const wanted = layer.source.type === 'image' ? 'a GeoPDF' : 'a GeoJSON, GPX, KML or KMZ file';
    throw new Error(`${file.name} cannot replace the file of ${layer.name}: choose ${wanted}.`);
  }
  const draft = await importFile(file, file.name);
  // Removed while the file was read: its new file goes, as the old one did.
  if (!state.layers.some((l) => l.id === id)) return void deleteFile(storedFile(draft.source)!);
  replaceLayerSource(id, draft.source, draft.bounds);
}

export function removeLayer(id: string): void {
  if (!state.layers.some((l) => l.id === id)) return;
  setState('layers', (layers) => layers.filter((l) => l.id !== id));
  if (state.activeLayerId === id) setState('activeLayerId', undefined);
}

/** Removes every layer that `matches`. */
export function removeLayersWhere(matches: (layer: Layer) => boolean): void {
  for (const layer of state.layers.filter(matches)) removeLayer(layer.id);
}

/** Moves a layer to `index` in drawing order (0 is the bottom). */
export function moveLayer(id: string, index: number): void {
  setState('layers', (layers) => moveItem(layers, layers.findIndex((l) => l.id === id), index));
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(items.length - 1, to));
  if (from < 0 || from === target) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Opens a layer's settings, closing those open before; undefined closes them. */
export function setActiveLayer(id: string | undefined): void {
  setState('activeLayerId', id);
}

export function setView(view: View): void {
  setState('view', view);
}

export function setProxyAddress(proxy: string): void {
  setState('settings', 'proxy', proxy.trim());
}

/** Switches tile caching off for every layer, or back to each layer's own setting. */
export function setTileCacheOff(off: boolean): void {
  setState('settings', 'tileCacheOff', off || undefined);
}

/** Sends no request, every request, or those to the hosts that use it through the CORS proxy. */
export function setProxyMode(mode: ProxyMode): void {
  setState('settings', 'proxyMode', mode === 'hosts' ? undefined : mode);
}

/** Sets the colour the map is drawn on, or with none goes back to white. */
export function setBackground(color: string | undefined): void {
  setState('settings', 'background', color);
}

/** Shows the ground in 3D, raised by its elevation, or flat. */
export function setTerrain(on: boolean): void {
  setState('settings', 'terrain', on || undefined);
}

/** Routes a host's requests through the CORS proxy, or stops doing so. */
export function setHostProxied(host: string, proxied: boolean): void {
  setState('settings', 'proxiedHosts', (hosts) =>
    proxied ? (hosts.includes(host) ? hosts : [...hosts, host]) : hosts.filter((h) => h !== host),
  );
}

/** Makes a polygon the focus area, in place of the one before. */
export function setFocus(corners: LngLat[]): void {
  setState('focus', corners);
}

export function clearFocus(): void {
  setState('focus', undefined);
}

/** The bounds of the focus area, within which layers request tiles; none without one. */
export const focusBounds = createRoot(() => createMemo((): Bounds | undefined => state.focus && cornersBounds(state.focus)));
