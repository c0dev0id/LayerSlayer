import { createEffect, createRoot } from 'solid-js';
import { createLayer, MAX_ZOOM, MIN_ZOOM, storedFile, type Layer, type LayerDraft } from '../model/layer';
import { deleteFile } from './files';
import { setProxy } from './net';
import { persistedStore } from './persist';

export interface Settings {
  /** CORS proxy address with {url} where the target goes; empty for none. */
  proxy: string;
  /** Hosts whose requests go through the proxy. */
  proxiedHosts: string[];
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
  /** The layer whose settings the panel shows. */
  activeLayerId?: string;
  settings: Settings;
  view: View;
}

const STORAGE_KEY = 'webmap';

const SOURCE_TYPES = new Set(['xyz', 'wms', 'wmts', 'arcgis-map', 'arcgis-features', 'vector-tiles', 'wfs', 'ogc-features', 'geojson', 'style', 'image']);

/** What a first visit starts with: a vector base map that needs no key. */
const FIRST_LAYER: LayerDraft = {
  name: 'OpenFreeMap Liberty',
  source: { type: 'style', url: 'https://tiles.openfreemap.org/styles/liberty' },
  // As if added from its library entry, which then shows it as on the map.
  origin: 'https://tiles.openfreemap.org/styles/liberty',
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
    SOURCE_TYPES.has(l.source.type)
  );
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
    activeLayerId: layers.some((l) => l.id === stored.activeLayerId) ? stored.activeLayerId : layers.at(-1)?.id,
    settings: {
      proxy: typeof settings?.proxy === 'string' ? settings.proxy : '',
      proxiedHosts: Array.isArray(settings?.proxiedHosts) ? settings.proxiedHosts.filter((h) => typeof h === 'string') : [],
    },
    view:
      view && Array.isArray(view.center) && typeof view.zoom === 'number'
        ? { center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0 }
        : fallback.view,
  };
}

const [state, setState] = persistedStore(STORAGE_KEY, 'layers', parseState, defaultState);
export { state };

createRoot(() => {
  createEffect(() => setProxy(state.settings.proxy, [...state.settings.proxiedHosts]));
});

/** Adds a layer on top of the others and makes it the active one. */
export function addLayer(draft: LayerDraft): Layer {
  const layer = createLayer(draft, state.layers);
  setState('layers', state.layers.length, layer);
  setState('activeLayerId', layer.id);
  return layer;
}

export type LayerSettings = Partial<Pick<Layer, 'name' | 'visible' | 'opacity' | 'minzoom' | 'maxzoom' | 'color' | 'bounds' | 'cache'>>;

export function updateLayer(id: string, patch: LayerSettings): void {
  if (patch.minzoom !== undefined) patch.minzoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, patch.minzoom));
  if (patch.maxzoom !== undefined) patch.maxzoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, patch.maxzoom));
  setState('layers', (l) => l.id === id, patch);
}

export function removeLayer(id: string): void {
  const index = state.layers.findIndex((l) => l.id === id);
  const layer = state.layers[index];
  if (!layer) return;
  const file = storedFile(layer.source);
  setState('layers', (layers) => layers.filter((l) => l.id !== id));
  if (state.activeLayerId === id) setState('activeLayerId', state.layers[Math.min(index, state.layers.length - 1)]?.id);
  if (file) void deleteFile(file);
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

export function setActiveLayer(id: string): void {
  setState('activeLayerId', id);
}

export function setView(view: View): void {
  setState('view', view);
}

export function setProxyAddress(proxy: string): void {
  setState('settings', 'proxy', proxy.trim());
}

/** Routes a host's requests through the CORS proxy, or stops doing so. */
export function setHostProxied(host: string, proxied: boolean): void {
  setState('settings', 'proxiedHosts', (hosts) =>
    proxied ? (hosts.includes(host) ? hosts : [...hosts, host]) : hosts.filter((h) => h !== host),
  );
}
