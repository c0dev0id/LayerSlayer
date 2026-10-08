import { geojsonBounds } from '../geo/bounds';
import type { OsmQuerySource } from '../model/layer';
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

async function keep(filters: readonly string[], geojson: GeoJSON.FeatureCollection): Promise<OsmQuerySource> {
  const file = await storeFile(new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' }));
  return { type: 'osm-query', filters: [...filters], file, queried: new Date().toISOString() };
}

/** Adds a layer of the features the filters find in the focus area, unless none are found. Resolves to how many were. */
export async function addOsmQueryLayer(name: string, filters: readonly string[]): Promise<number> {
  const geojson = await findOsmFeatures(filters, focusArea());
  if (geojson.features.length > 0) {
    const bounds = geojsonBounds(geojson);
    addLayer({ name, source: await keep(filters, geojson), attribution: OSM_ATTRIBUTION, ...(bounds && { bounds }) });
  }
  return geojson.features.length;
}

/** Runs an OSM query layer's query again in the focus area as it is now. Resolves to how many features it found. */
export async function updateOsmQueryLayer(id: string): Promise<number> {
  const source = state.layers.find((l) => l.id === id)?.source;
  if (source?.type !== 'osm-query') throw new Error('The layer is no OSM query.');
  const filters = [...source.filters];
  const geojson = await findOsmFeatures(filters, focusArea());
  replaceLayerSource(id, await keep(filters, geojson), geojsonBounds(geojson));
  return geojson.features.length;
}
