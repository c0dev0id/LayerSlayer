import type { LngLat } from '../model/route';
import { planeAt } from './plane';

/**
 * The tolerance in metres up to which Douglas–Peucker keeps each point of a line, splitting
 * no stretch whose farthest point lies within `floor`. The ends are kept at any tolerance;
 * another point is kept while the tolerance stays below its distance from the line between
 * the points that split its stretch, and below theirs, since the splits do not depend on
 * the tolerance. Points within the floor get 0. Distances are measured on a plane fitted
 * at the line's mean latitude, which is close enough for the lengths of a track.
 */
function keptUpTo(points: readonly LngLat[], floor: number): Float64Array {
  const xy = points.map(planeAt(points));
  const upTo = new Float64Array(points.length);
  upTo[0] = upTo[points.length - 1] = Infinity;
  // A stack of index ranges, each with what its ends are kept up to, rather than recursion,
  // for tracks of many thousand points.
  const stack: [number, number, number][] = [[0, points.length - 1, Infinity]];
  while (stack.length > 0) {
    const [first, last, ends] = stack.pop()!;
    const [ax, ay] = xy[first]!;
    const [bx, by] = xy[last]!;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    let farthest = -1;
    let max = floor;
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
    const kept = Math.min(max, ends);
    upTo[farthest] = kept;
    stack.push([first, farthest, kept], [farthest, last, kept]);
  }
  return upTo;
}

/**
 * The points of a line that Douglas–Peucker keeps at a tolerance in metres: the ends, and
 * every point farther than the tolerance from the line between its kept neighbours.
 */
export function simplifyLine(points: readonly LngLat[], tolerance: number): LngLat[] {
  if (points.length <= 2) return [...points];
  const upTo = keptUpTo(points, tolerance);
  return points.filter((_, i) => upTo[i]! > tolerance);
}

/** The line simplified to at most `maxPoints`, at a tolerance of 5 m or, where that keeps too many, at the least tolerance that does not. */
export function simplifyToCount(points: readonly LngLat[], maxPoints: number): LngLat[] {
  if (points.length <= maxPoints) return [...points];
  const upTo = keptUpTo(points, 5);
  // Kept above the tolerance of the point ranked just after the last that fits.
  const tolerance = Math.max(5, upTo.slice().sort()[points.length - 1 - maxPoints]!);
  return points.filter((_, i) => upTo[i]! > tolerance);
}
