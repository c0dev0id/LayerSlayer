import type { XY } from './nearest';

const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];

/** Where along the segment from `p` to `q`, 0 to 1 exclusive, it crosses the edges of `ring`, in order. */
function crossings(ring: readonly XY[], p: XY, q: XY): number[] {
  const r: XY = [q[0] - p[0], q[1] - p[1]];
  const found: number[] = [];
  ring.forEach((e1, i) => {
    const e2 = ring[(i + 1) % ring.length]!;
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

/** Whether a point lies inside a ring, by the even-odd rule. */
export function insideRing([x, y]: XY, ring: readonly XY[]): boolean {
  let inside = false;
  ring.forEach(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  });
  return inside;
}

/**
 * The parts of `lines` that lie outside `ring`, cut where they cross its edges. Lines and
 * ring are in one plane; for cuts where the map draws its lines, that is Web Mercator.
 */
export function linesOutside(lines: readonly (readonly XY[])[], ring: readonly XY[]): XY[][] {
  const parts: XY[][] = [];
  for (const line of lines) {
    let part: XY[] | undefined;
    for (let i = 1; i < line.length; i++) {
      const [p, q] = [line[i - 1]!, line[i]!];
      const at = (t: number): XY => (t === 0 ? p : t === 1 ? q : [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      const stops = [0, ...crossings(ring, p, q), 1];
      for (let k = 1; k < stops.length; k++) {
        const [t0, t1] = [stops[k - 1]!, stops[k]!];
        if (insideRing(at((t0 + t1) / 2), ring)) part = undefined;
        else if (part) part.push(at(t1));
        else parts.push((part = [at(t0), at(t1)]));
      }
    }
  }
  return parts;
}
