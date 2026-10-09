import type { LngLat } from '../model/route';
import { findWithOverpass } from './overpass';
import { findWithPostpass } from './postpass';

/**
 * OpenStreetMap data from Postpass, which answers in about a second, and from the Overpass
 * API where Postpass fails. Both are public services run by volunteers; either may be
 * overloaded or down for a while.
 */

/** A way to get an answer, named for the error message. */
export interface Source<T> {
  name: string;
  ask: () => Promise<T>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The answer of the first source that gives one; where none does, an error naming every reason. */
export async function firstAnswer<T>(sources: readonly Source<T>[]): Promise<T> {
  const failures: string[] = [];
  for (const { name, ask } of sources) {
    try {
      return await ask();
    } catch (error) {
      failures.push(`${name}: ${message(error)}`);
    }
  }
  throw new Error(failures.join(' '));
}

/** The OSM features matching any of the filters within the polygon, for an OSM query layer. */
export function findOsmFeatures(filters: readonly string[], area: readonly LngLat[]): Promise<GeoJSON.FeatureCollection> {
  return firstAnswer([
    { name: 'Postpass', ask: () => findWithPostpass(filters, area) },
    { name: 'Overpass API', ask: () => findWithOverpass(filters, area) },
  ]);
}
