import { MAX_LATITUDE } from '../geo/mercator';
import { MAX_ZOOM } from '../model/layer';
import type { LngLat } from '../model/route';

/**
 * A spot on the map for other apps: its coordinates as text, Google Maps and Street View
 * opened at it through Google's documented Maps URLs (developers.google.com/maps/documentation/urls),
 * and a link that opens Layer Slayer itself there.
 */

/** "lat,lon" with six decimals (about 0.1 m), the order most apps read. */
export function latLonText([lng, lat]: LngLat): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Google Maps with a pin at the spot. */
export function googleMapsUrl(lngLat: LngLat): string {
  return `https://www.google.com/maps/search/?api=1&query=${latLonText(lngLat)}`;
}

/** Google Street View at the panorama nearest the spot. */
export function streetViewUrl(lngLat: LngLat): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latLonText(lngLat)}`;
}

/** A spot and a zoom to open the map at. */
export interface SpotView {
  center: LngLat;
  zoom: number;
}

/** `#map=zoom/lat,lon`, or `#map=zoom/lat/lon` as openstreetmap.org writes it; the zoom may have decimals. */
const MAP_HASH = /^#map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)[,/](-?\d+(?:\.\d+)?)$/;

/**
 * The page at `page` (its address without query or hash) opened at the spot and zoom:
 * `#map=zoom/lat,lon`, the coordinates with five decimals (about a metre) and separated
 * by a comma as most apps read them.
 */
export function spotLink(page: string, [lng, lat]: LngLat, zoom: number): string {
  return `${page}#map=${Math.round(zoom * 100) / 100}/${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** The spot and zoom a page address's hash opens the map at, if it names one the map can show. */
export function readSpotLink(hash: string): SpotView | undefined {
  const match = MAP_HASH.exec(hash);
  if (!match) return undefined;
  const [zoom, lat, lng] = match.slice(1).map(Number) as [number, number, number];
  if (zoom > MAX_ZOOM || Math.abs(lat) > MAX_LATITUDE || Math.abs(lng) > 180) return undefined;
  return { center: [lng, lat], zoom };
}
