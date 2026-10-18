import type { LngLat } from '../model/route';

/**
 * Decodes an encoded polyline (Google's format, as returned by OSRM) to [lng, lat] pairs.
 * OSRM's `polyline6` uses precision 6.
 */
export function decodePolyline(encoded: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lng / factor, lat / factor]);
  }
  return points;
}

/** Encodes [lng, lat] pairs as a polyline, as OSRM does: the format decodePolyline reads. */
export function encodePolyline(points: readonly LngLat[], precision = 6): string {
  const factor = 10 ** precision;
  let [lastLat, lastLng] = [0, 0];
  let encoded = '';
  const add = (delta: number) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    while (value >= 0x20) {
      encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    encoded += String.fromCharCode(value + 63);
  };
  for (const [lng, lat] of points) {
    const [y, x] = [Math.round(lat * factor), Math.round(lng * factor)];
    add(y - lastLat);
    add(x - lastLng);
    [lastLat, lastLng] = [y, x];
  }
  return encoded;
}
