import type { Bounds } from '../model/layer';
import { validBounds } from './mercator';

/** The bounds of all coordinates in a GeoJSON object, if it has any in degrees. */
export function geojsonBounds(geojson: GeoJSON.GeoJSON): Bounds | undefined {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    for (const item of value) visit(item);
  };
  const walk = (object: GeoJSON.GeoJSON | null): void => {
    if (!object) return;
    if (object.type === 'FeatureCollection') object.features.forEach(walk);
    else if (object.type === 'Feature') walk(object.geometry);
    else if (object.type === 'GeometryCollection') object.geometries.forEach(walk);
    else visit(object.coordinates);
  };
  walk(geojson);
  return west <= east && south <= north ? validBounds(west, south, Math.max(east, west + 1e-6), Math.max(north, south + 1e-6)) : undefined;
}

export function cornersBounds(corners: readonly (readonly [number, number])[]): Bounds | undefined {
  const lngs = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  return validBounds(Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats));
}

/** Where two bounds overlap; none when they do not. */
export function intersectBounds(a: Bounds, b: Bounds): Bounds | undefined {
  const west = Math.max(a[0], b[0]);
  const south = Math.max(a[1], b[1]);
  const east = Math.min(a[2], b[2]);
  const north = Math.min(a[3], b[3]);
  return west < east && south < north ? [west, south, east, north] : undefined;
}

/** Whether areas are known and none of them meets `box`. */
export function allOutside(areas: readonly Bounds[] | undefined, box: Bounds): boolean {
  return areas !== undefined && areas.length > 0 && areas.every((area) => !intersectBounds(area, box));
}
