/** A point in screen pixels. */
export type XY = readonly [number, number];

/** The point of the segment a–b closest to p. */
export function closestOnSegment(p: XY, a: XY, b: XY): XY {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return [a[0] + t * dx, a[1] + t * dy];
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
