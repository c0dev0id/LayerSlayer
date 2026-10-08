import { createSignal } from 'solid-js';
import { geojsonBounds } from '../geo/bounds';
import type { GeoJsonSource, LayerIcon } from '../model/layer';
import type { LngLat } from '../model/route';
import { findOsmFeatures, OSM_ATTRIBUTION } from '../services/overpass';
import { storeFile } from './files';
import { addLayer, replaceLayerSource, state } from './store';

/**
 * Layers of OpenStreetMap features, queried in the focus area once and kept as a file.
 * The focus area is required: the Overpass API answers queries for limited areas only.
 */

function focusArea(): LngLat[] {
  if (!state.focus) throw new Error('Draw a focus area first: OSM queries look within it.');
  return state.focus;
}

/** Stores the features as a GeoJSON file: turned to text at once, then written while the caller goes on. */
async function keep(filters: string[], geojson: GeoJSON.FeatureCollection): Promise<GeoJsonSource> {
  const file = await storeFile(new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' }));
  return { type: 'geojson', data: { file, name: 'OpenStreetMap.geojson' }, query: { filters, queried: new Date().toISOString() } };
}

/** Adds a layer of the features the filters find in the focus area, unless none are found. Resolves to how many were. */
export async function addOsmQueryLayer(name: string, filters: string[], icon?: LayerIcon): Promise<number> {
  const geojson = await findOsmFeatures(filters, focusArea());
  const count = geojson.features.length;
  if (count > 0) {
    const source = keep(filters, geojson);
    const bounds = geojsonBounds(geojson);
    addLayer({ name, source: await source, attribution: OSM_ATTRIBUTION, ...(bounds && { bounds }), ...(icon && { icon }) });
  }
  return count;
}

/** The layers whose query is running again. */
const [updating, setUpdating] = createSignal<ReadonlySet<string>>(new Set());

export function isUpdating(id: string): boolean {
  return updating().has(id);
}

function setUpdatingLayer(id: string, running: boolean): void {
  const next = new Set(updating());
  if (running) next.add(id);
  else next.delete(id);
  setUpdating(next);
}

/** Runs an OSM query layer's query again in the focus area as it is now, once at a time. Resolves to how many features it found. */
export async function updateOsmQueryLayer(id: string): Promise<number> {
  const source = state.layers.find((l) => l.id === id)?.source;
  if (source?.type !== 'geojson' || !source.query) throw new Error('The layer is no OSM query.');
  if (isUpdating(id)) throw new Error('The layer is being updated already.');
  const filters = [...source.query.filters];
  setUpdatingLayer(id, true);
  try {
    const geojson = await findOsmFeatures(filters, focusArea());
    const updated = keep(filters, geojson);
    const bounds = geojsonBounds(geojson);
    replaceLayerSource(id, await updated, bounds);
    return geojson.features.length;
  } finally {
    setUpdatingLayer(id, false);
  }
}
