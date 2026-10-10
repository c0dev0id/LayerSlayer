import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, createRoot, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { AREA_ZOOM, areaZoom, type Bounds, type Layer } from '../model/layer';
import { keepStored, readStored } from './persist';
import { state } from './store';

/** The map once it exists, for actions like zooming to a layer. */
export const [map, setMap] = createSignal<MapLibreMap>();

/** Room left around an area the map is moved to show, in pixels. */
const AREA_PADDING = 40;

/** Moves the map to show the bounds, coming no closer than the zoom areas are shown at. */
export function showBounds(bounds: Bounds): void {
  map()?.fitBounds(bounds, { padding: AREA_PADDING, maxZoom: AREA_ZOOM });
}

/** Moves the map to a layer's area, at a zoom the layer is drawn at. */
export function showLayerArea(layer: Pick<Layer, 'bounds' | 'minzoom' | 'maxzoom'>): void {
  const m = map();
  const camera = layer.bounds && m?.cameraForBounds(layer.bounds, { padding: AREA_PADDING });
  if (!m || !camera || camera.zoom === undefined) return;
  m.easeTo({ center: camera.center, zoom: areaZoom(camera.zoom, layer) });
}

const PANEL_COLLAPSED_KEY = 'layerslayer-panel-collapsed';

/**
 * Whether the panel is folded to its header, which narrow screens offer to give the map
 * room. This browser's convenience, kept in local storage rather than in projects.
 */
const [panelCollapsed, setCollapsed] = createSignal(readStored(PANEL_COLLAPSED_KEY) === '1');
export { panelCollapsed };

export function setPanelCollapsed(collapsed: boolean): void {
  setCollapsed(collapsed);
  keepStored(PANEL_COLLAPSED_KEY, collapsed ? '1' : undefined);
}

/**
 * Whether the map shows only the layer whose settings are open, over the bottom layer: a
 * view of the moment that leaves every layer's eye as it is, so turning it off shows the
 * layers as they were. Not kept; it ends when the settings close.
 */
const [onlyOpen, setOnlyOpen] = createSignal(false);
export { onlyOpen, setOnlyOpen };

/** The layer shown alone, if one is. */
export function onlyLayerId(): string | undefined {
  return onlyOpen() ? state.activeLayerId : undefined;
}

createRoot(() => {
  createEffect(() => {
    if (!state.activeLayerId) setOnlyOpen(false);
  });
});

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

export { errorMessage } from './net';
