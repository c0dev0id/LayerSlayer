import type { Map as MapLibreMap } from 'maplibre-gl';
import { lngLatToMercator, mercatorToLngLat, WORLD } from '../geo/mercator';
import { within } from '../model/stored';

/** Waypoints are drawn at full size from this zoom; below it they halve every HALVING zooms, down to MIN_SCALE. */
const FULL_ZOOM = 14;
const HALVING = 4;
const MIN_SCALE = 0.35;

/** How large a waypoint is drawn, as a share of its size, where the map shows the ground at `zoom`. */
export function waypointScale(zoom: number): number {
  return within(2 ** ((zoom - FULL_ZOOM) / HALVING), MIN_SCALE, 1, MIN_SCALE);
}

/**
 * The zoom at which the map shows the ground at a place: the map's zoom on a flat map, lower
 * with distance from the camera in 3D. It is measured across the screen, which the tilt does
 * not foreshorten.
 */
export function zoomAt(map: MapLibreMap, lngLat: [number, number]): number {
  const step = 10;
  const [x, y] = lngLatToMercator(...lngLat);
  const bearing = (map.getBearing() * Math.PI) / 180;
  const beside = mercatorToLngLat(x + step * Math.cos(bearing), y - step * Math.sin(bearing));
  const pixels = map.project(lngLat).dist(map.project(beside));
  return Math.log2((pixels * WORLD) / (512 * step));
}
