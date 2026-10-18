import type { LngLat } from '../model/route';
import { planeAt } from './plane';

/**
 * The points of a line that Douglas–Peucker keeps at a tolerance in metres: the ends, and
 * every point farther than the tolerance from the line between its kept neighbours.
 * Distances are measured on a plane fitted at the line's mean latitude, which is close
 * enough for the lengths of a track.
 */
export function simplifyLine(points: readonly LngLat[], tolerance: number): LngLat[] {
  if (points.length <= 2) return [...points];
  const xy = points.map(planeAt(points));
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

/**
 * The line simplified to at most `maxPoints`, at a tolerance of 5 m or, where that keeps
 * too many, at the least tolerance that does not, found to within a metre.
 */
export function simplifyToCount(points: readonly LngLat[], maxPoints: number): LngLat[] {
  if (points.length <= maxPoints) return [...points];
  let [tooFew, enough] = [0, 5];
  let result = simplifyLine(points, enough);
  if (result.length <= maxPoints) return result;
  while (result.length > maxPoints) {
    [tooFew, enough] = [enough, enough * 2];
    result = simplifyLine(points, enough);
  }
  while (enough - tooFew > 1) {
    const middle = (tooFew + enough) / 2;
    const attempt = simplifyLine(points, middle);
    if (attempt.length > maxPoints) tooFew = middle;
    else [enough, result] = [middle, attempt];
  }
  return result;
}
