import type { LngLat } from '../model/route';

/**
 * A spot on the map for other apps: its coordinates as text, and Google Maps and Street View
 * opened at it through Google's documented Maps URLs (developers.google.com/maps/documentation/urls).
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
