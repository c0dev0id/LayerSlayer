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

/**
 * The line nearest to p: its index, the distance and the closest point on it. Lines are
 * polylines; undefined when there is none with a point.
 */
export function nearestLine(lines: readonly (readonly XY[])[], p: XY): { index: number; distance: number; point: XY } | undefined {
  let best: { index: number; distance: number; point: XY } | undefined;
  const consider = (index: number, point: XY) => {
    const distance = Math.hypot(p[0] - point[0], p[1] - point[1]);
    if (!best || distance < best.distance) best = { index, distance, point };
  };
  lines.forEach((line, index) => {
    if (line.length === 1) consider(index, line[0]!);
    for (let i = 1; i < line.length; i++) consider(index, closestOnSegment(p, line[i - 1]!, line[i]!));
  });
  return best;
}
