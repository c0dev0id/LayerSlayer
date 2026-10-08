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
