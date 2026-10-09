import type { LngLat } from '../model/route';
import { findWithOverpass } from './overpass';
import { findWithPostpass } from './postpass';

/**
 * OpenStreetMap features for OSM query layers: from Postpass, which answers area queries
 * in about a second, and from the Overpass API where Postpass fails. Both are public
 * services run by volunteers; either may be overloaded or down for a while.
 */

type Finder = (filters: readonly string[], area: readonly LngLat[]) => Promise<GeoJSON.FeatureCollection>;

export const OSM_SOURCES: readonly { name: string; find: Finder }[] = [
  { name: 'Postpass', find: findWithPostpass },
  { name: 'Overpass API', find: findWithOverpass },
];

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The OSM features matching any of the filters within the polygon, from the first source that answers. */
export async function findOsmFeatures(filters: readonly string[], area: readonly LngLat[], sources = OSM_SOURCES): Promise<GeoJSON.FeatureCollection> {
  const failures: string[] = [];
  for (const { name, find } of sources) {
    try {
      return await find(filters, area);
    } catch (error) {
      failures.push(`${name}: ${message(error)}`);
    }
  }
  throw new Error(failures.join(' '));
}
