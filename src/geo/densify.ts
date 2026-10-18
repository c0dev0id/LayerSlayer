import type { LngLat } from '../model/route';
import { planeAt } from './plane';

/** A line's points and each one's distance from its start in metres. */
export interface Measured {
  points: LngLat[];
  distances: number[];
}

/** The line with points added along its segments so that consecutive points are at most `spacing` metres apart. */
export function densify(line: readonly LngLat[], spacing: number): Measured {
  const toPlane = planeAt(line);
  const points: LngLat[] = [];
  const distances: number[] = [];
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
      }
      travelled += length;
    }
    points.push([p[0], p[1]]);
    distances.push(travelled);
  });
  return { points, distances };
}
