import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { worldFraction } from '../geo/mercator';
import { waypointScale, zoomAt } from './waypointScale';

describe('waypointScale', () => {
  it('draws waypoints at full size from zoom 14 and halves them every four zooms below, down to about a third', () => {
    expect(waypointScale(14)).toBe(1);
    expect(waypointScale(18)).toBe(1);
    expect(waypointScale(10)).toBeCloseTo(0.5);
    expect(waypointScale(12)).toBeCloseTo(Math.SQRT1_2);
    expect(waypointScale(2)).toBe(0.35);
  });

  it('draws them at the smallest size where the zoom cannot be measured', () => {
    expect(waypointScale(Number.NaN)).toBe(0.35);
    expect(waypointScale(Number.NEGATIVE_INFINITY)).toBe(0.35);
  });
});

/** A map at `zoom` turned by `bearing` degrees, whose screen is squashed to `upright` of its height, as a tilt would. */
function mapAt(zoom: number, bearing: number, upright: number): MapLibreMap {
  const size = 512 * 2 ** zoom;
  const turn = (bearing * Math.PI) / 180;
  const project = ([lng, lat]: [number, number]) => {
    const [fx, fy] = worldFraction(lng, lat);
    const [wx, wy] = [fx * size, fy * size];
    const point = { x: wx * Math.cos(turn) + wy * Math.sin(turn), y: (wy * Math.cos(turn) - wx * Math.sin(turn)) * upright };
    return { ...point, dist: (other: typeof point) => Math.hypot(point.x - other.x, point.y - other.y) };
  };
  return { getBearing: () => bearing, project } as unknown as MapLibreMap;
}

describe('zoomAt', () => {
  it('measures the map zoom at any latitude and bearing, across the screen where a tilt does not squash it', () => {
    for (const [lng, lat] of [[11.6, 48.1], [-70, -33], [25, 69]] as [number, number][]) {
      for (const bearing of [0, 37, 90, 200]) {
        expect(zoomAt(mapAt(12.5, bearing, 1), [lng, lat])).toBeCloseTo(12.5, 4);
        expect(zoomAt(mapAt(12.5, bearing, 0.4), [lng, lat])).toBeCloseTo(12.5, 4);
      }
    }
  });
});
