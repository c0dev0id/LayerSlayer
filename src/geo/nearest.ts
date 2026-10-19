/** A point in a plane, such as screen pixels or Web Mercator metres. */
export type XY = readonly [number, number];

/** How far along the segment a–b its point closest to p lies: 0 at a, 1 at b. */
export function fractionOnSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  return length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
}

/** The point of the segment a–b closest to p. */
export function closestOnSegment(p: XY, a: XY, b: XY): XY {
  const t = fractionOnSegment(p, a, b);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Where a point lies nearest on lines: which line, which of its segments and how far along it, how far from p, and the point. */
export interface NearestPlace {
  index: number;
  segment: number;
  t: number;
  distance: number;
  point: XY;
}

/**
 * The place on the lines nearest to p. Lines are polylines; a line of one point has it as
 * its only place. Undefined when there is no line with a point.
 */
export function nearestLine(lines: readonly (readonly XY[])[], p: XY): NearestPlace | undefined {
  let best: NearestPlace | undefined;
  const consider = (index: number, segment: number, t: number, point: XY) => {
    const distance = Math.hypot(p[0] - point[0], p[1] - point[1]);
    if (!best || distance < best.distance) best = { index, segment, t, distance, point };
  };
  lines.forEach((line, index) => {
    if (line.length === 1) consider(index, 0, 0, line[0]!);
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1]!, line[i]!];
      const t = fractionOnSegment(p, a, b);
      consider(index, i - 1, t, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  });
  return best;
}
