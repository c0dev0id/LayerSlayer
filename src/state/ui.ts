import type { Map as MapLibreMap } from 'maplibre-gl';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Bounds } from '../model/layer';

/** The map once it exists, for actions like zooming to a layer. */
export const [map, setMap] = createSignal<MapLibreMap>();

/** Moves the map to show the bounds, coming no closer than `maxZoom`. */
export function showBounds(bounds: Bounds, maxZoom = 16): void {
  map()?.fitBounds(bounds, { padding: 40, maxZoom });
}

const PANEL_COLLAPSED_KEY = 'webmap-panel-collapsed';

function storedPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the panel is folded to its header, which narrow screens offer to give the map
 * room. This browser's convenience, kept in local storage rather than in projects.
 */
const [panelCollapsed, setCollapsed] = createSignal(storedPanelCollapsed());
export { panelCollapsed };

export function setPanelCollapsed(collapsed: boolean): void {
  setCollapsed(collapsed);
  try {
    if (collapsed) localStorage.setItem(PANEL_COLLAPSED_KEY, '1');
    else localStorage.removeItem(PANEL_COLLAPSED_KEY);
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}

/** The map's current zoom, shown next to a layer's zoom range. */
export const [zoom, setZoom] = createSignal(0);

/** Why a layer is not drawn as it should be, by layer id: its last error since it last drew. */
export const [layerErrors, setLayerErrors] = createStore<Record<string, string>>({});

export function reportLayerError(layerId: string, message: string): void {
  if (layerErrors[layerId] !== message) setLayerErrors(layerId, message);
}

export function clearLayerError(layerId: string): void {
  if (layerErrors[layerId] !== undefined) setLayerErrors(layerId, undefined!);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
