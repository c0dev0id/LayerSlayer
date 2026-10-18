import type { LngLat } from '../model/route';
import { lngLatToMercator, mercatorToLngLat } from './mercator';

type XY = [number, number];

const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];

/** Where along the segment from `p` to `q`, 0 to 1 exclusive, it crosses the edges of `polygon`, in order. */
function crossings(polygon: readonly XY[], p: XY, q: XY): number[] {
  const r: XY = [q[0] - p[0], q[1] - p[1]];
  const found: number[] = [];
  polygon.forEach((e1, i) => {
    const e2 = polygon[(i + 1) % polygon.length]!;
    const s: XY = [e2[0] - e1[0], e2[1] - e1[1]];
    const denominator = cross(r, s);
    if (denominator === 0) return;
    const pe: XY = [e1[0] - p[0], e1[1] - p[1]];
    const t = cross(pe, s) / denominator;
    const u = cross(pe, r) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) found.push(t);
  });
  return found.sort((a, b) => a - b);
}

/** Whether a point lies inside a polygon, by the even-odd rule. */
function inside(polygon: readonly XY[], [x, y]: XY): boolean {
  let result = false;
  polygon.forEach(([x1, y1], i) => {
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) result = !result;
  });
  return result;
}

/**
 * The parts of `lines` that lie outside the polygon `ring`, cut where they cross its edges.
 * A straight line between two positions is straight on the map, in Web Mercator, so that
 * is where the cuts are found.
 */
export function linesOutside(lines: readonly (readonly LngLat[])[], ring: readonly LngLat[]): LngLat[][] {
  const polygon = ring.map(([lng, lat]) => lngLatToMercator(lng, lat));
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const [west, east, south, north] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const parts: LngLat[][] = [];
  for (const line of lines) {
    let part: LngLat[] | undefined;
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1]!, line[i]!];
      const p = lngLatToMercator(a[0], a[1]);
      const q = lngLatToMercator(b[0], b[1]);
      const missesBox = Math.max(p[0], q[0]) < west || Math.min(p[0], q[0]) > east || Math.max(p[1], q[1]) < south || Math.min(p[1], q[1]) > north;
      const stops = [0, ...(missesBox ? [] : crossings(polygon, p, q)), 1];
      const at = (t: number): LngLat => (t === 0 ? a : t === 1 ? b : mercatorToLngLat(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t));
      for (let k = 1; k < stops.length; k++) {
        const [t0, t1] = [stops[k - 1]!, stops[k]!];
        const middle: XY = [p[0] + (q[0] - p[0]) * ((t0 + t1) / 2), p[1] + (q[1] - p[1]) * ((t0 + t1) / 2)];
        if (!missesBox && inside(polygon, middle)) {
          part = undefined;
        } else if (part && t0 === 0) {
          part.push(at(t1));
        } else {
          part = [at(t0), at(t1)];
          parts.push(part);
        }
      }
    }
  }
  return parts;
}
