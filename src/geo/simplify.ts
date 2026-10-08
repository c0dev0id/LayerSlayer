import type { LngLat } from '../model/route';

/** Metres per degree of latitude, and of longitude at the equator. */
const METRES_PER_DEGREE = 111_320;

/**
 * The points of a line that Douglas–Peucker keeps at a tolerance in metres: the ends, and
 * every point farther than the tolerance from the line between its kept neighbours.
 * Distances are measured on a plane fitted at the line's mean latitude, which is close
 * enough for the lengths of a track.
 */
export function simplifyLine(points: readonly LngLat[], tolerance: number): LngLat[] {
  if (points.length <= 2) return [...points];
  const meanLat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const scale = Math.cos((meanLat * Math.PI) / 180);
  const xy = points.map(([lng, lat]) => [lng * scale * METRES_PER_DEGREE, lat * METRES_PER_DEGREE] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  // A stack of index ranges rather than recursion, for tracks of many thousand points.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = xy[first]!;
    const [bx, by] = xy[last]!;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    let farthest = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = xy[i]!;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
      const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (distance > max) {
        max = distance;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** The line simplified until it has at most `maxPoints`, starting at a tolerance of 5 m. */
export function simplifyToCount(points: readonly LngLat[], maxPoints: number): LngLat[] {
  if (points.length <= maxPoints) return [...points];
  let tolerance = 5;
  let result = simplifyLine(points, tolerance);
  while (result.length > maxPoints) {
    tolerance *= 2;
    result = simplifyLine(points, tolerance);
  }
  return result;
}
