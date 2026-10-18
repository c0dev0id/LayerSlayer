import type { LngLat } from '../model/route';
import { planeAt } from './plane';

/** A line's points, each one's distance from its start in metres, and whether it is one of the line's own rather than added between them. */
export interface Measured {
  points: LngLat[];
  distances: number[];
  original: boolean[];
}

/** The line with points added along its segments so that consecutive points are at most `spacing` metres apart. */
export function densify(line: readonly LngLat[], spacing: number): Measured {
  const toPlane = planeAt(line);
  const points: LngLat[] = [];
  const distances: number[] = [];
  const original: boolean[] = [];
  let travelled = 0;
  line.forEach((p, i) => {
    const a = line[i - 1];
    if (a) {
      const [[ax, ay], [bx, by]] = [toPlane(a), toPlane(p)];
      const length = Math.hypot(bx - ax, by - ay);
      const parts = Math.ceil(length / spacing);
      for (let k = 1; k < parts; k++) {
        const t = k / parts;
        points.push([a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t]);
        distances.push(travelled + length * t);
        original.push(false);
      }
      travelled += length;
    }
    points.push([p[0], p[1]]);
    distances.push(travelled);
    original.push(true);
  });
  return { points, distances, original };
}
