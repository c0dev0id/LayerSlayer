import { validBounds } from '../geo/mercator';
import type { Bounds } from '../model/layer';
import type { LngLat } from '../model/route';
import { withParams } from '../map/urls';

/**
 * Place and address search with Nominatim, OpenStreetMap's geocoder. Its usage policy
 * (operations.osmfoundation.org/policies/nominatim) allows one request per second and no
 * search as you type, and asks for attribution.
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_ATTRIBUTION = 'Search: Nominatim, © OpenStreetMap contributors';
export const NOMINATIM_MIN_INTERVAL_MS = 1000;
const RESULT_LIMIT = 5;

export interface Place {
  /** The full description: name, street, town, region, country. */
  label: string;
  lngLat: LngLat;
  /** The place's extent, where it has one larger than a point. */
  bounds?: Bounds;
}

/** The search for `query`, preferring places within `near` (west, south, east, north) without being limited to them. */
export function searchUrl(query: string, near?: Bounds): string {
  return withParams(NOMINATIM_URL, {
    q: query.trim(),
    format: 'jsonv2',
    limit: RESULT_LIMIT,
    ...(near && { viewbox: near.join(',') }),
  });
}

interface NominatimPlace {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  /** South, north, west, east, as strings. */
  boundingbox?: unknown;
}

/** The places in a Nominatim answer; entries without a position are left out. */
export function parsePlaces(json: unknown): Place[] {
  if (!Array.isArray(json)) throw new Error('The search did not answer with a list of places.');
  return (json as NominatimPlace[]).flatMap((p): Place[] => {
    const lng = Number(p.lon);
    const lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    const box = Array.isArray(p.boundingbox) ? p.boundingbox.map(Number) : [];
    const bounds = box.length === 4 ? validBounds(box[2]!, box[0]!, box[3]!, box[1]!) : undefined;
    return [{ label: typeof p.display_name === 'string' ? p.display_name : `${lat}, ${lng}`, lngLat: [lng, lat], ...(bounds && { bounds }) }];
  });
}
