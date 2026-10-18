import type { Map as MapLibreMap } from 'maplibre-gl';
import { within } from '../model/stored';

/** Waypoints are drawn at full size from this zoom; below it they halve every HALVING zooms, down to MIN_SCALE. */
const FULL_ZOOM = 14;
const HALVING = 4;
const MIN_SCALE = 0.35;
/** Metres along the equator, which spans 512 px at zoom 0. */
const EQUATOR = 40_075_016.686;
/** Metres per degree of latitude. */
const METRES_PER_DEGREE = 111_320;

/** How large a waypoint is drawn, as a share of its size, where the map shows the ground at `zoom`. */
export function waypointScale(zoom: number): number {
  return within(2 ** ((zoom - FULL_ZOOM) / HALVING), MIN_SCALE, 1, MIN_SCALE);
}

/**
 * The zoom at which the map shows the ground at a place: the map's zoom on a flat map, lower
 * with distance from the camera in 3D. It is measured across the screen, which the tilt does
 * not foreshorten.
 */
export function zoomAt(map: MapLibreMap, [lng, lat]: [number, number]): number {
  const metres = 10;
  const across = ((map.getBearing() + 90) * Math.PI) / 180;
  const cos = Math.cos((lat * Math.PI) / 180);
  const beside: [number, number] = [lng + (metres * Math.sin(across)) / (METRES_PER_DEGREE * cos), lat + (metres * Math.cos(across)) / METRES_PER_DEGREE];
  const pixels = map.project([lng, lat]).dist(map.project(beside));
  return Math.log2(((pixels / metres) * EQUATOR * cos) / 512);
}
