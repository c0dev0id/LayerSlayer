import type { LngLat } from '../model/route';
import type { XY } from './nearest';

/** Metres per degree of latitude, and of longitude at the equator. */
export const METRES_PER_DEGREE = 111_320;

/** Metres per degree of longitude at a latitude. */
export const metresPerDegreeEast = (lat: number): number => Math.cos((lat * Math.PI) / 180) * METRES_PER_DEGREE;

/** The mean latitude of the points. */
export const meanLatitude = (points: readonly LngLat[]): number => points.reduce((sum, p) => sum + p[1], 0) / points.length;

/**
 * Positions in metres, x east and y north, on a plane fitted at the mean latitude of the
 * points: close enough for the lengths of a track.
 */
export function planeAt(points: readonly LngLat[]): (p: LngLat) => XY {
  const scale = metresPerDegreeEast(meanLatitude(points));
  return ([lng, lat]) => [lng * scale, lat * METRES_PER_DEGREE];
}
