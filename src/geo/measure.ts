import type { LngLat } from '../model/route';
import { fractionOnSegment } from './nearest';
import { planeAt } from './plane';

/** The Earth's mean radius in metres. */
const EARTH_RADIUS = 6_371_008.8;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The great-circle distance between two points in metres. */
export function distanceBetween([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const h = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The length of a line in metres. */
export function lineLength(line: readonly LngLat[]): number {
  let length = 0;
  for (let i = 1; i < line.length; i++) length += distanceBetween(line[i - 1]!, line[i]!);
  return length;
}

/** Metres between the points of a great circle as drawn, which bends on a Mercator map. */
const ARC_STEP = 20_000;

/**
 * The shortest way between two points, the great circle, with points at most ARC_STEP
 * metres apart. Its longitudes run on past ±180° rather than jump, so that the map draws
 * it the short way round.
 */
export function greatCircle(from: LngLat, to: LngLat): LngLat[] {
  const parts = Math.ceil(distanceBetween(from, to) / ARC_STEP);
  const vector = ([lng, lat]: LngLat) => [Math.cos(radians(lat)) * Math.cos(radians(lng)), Math.cos(radians(lat)) * Math.sin(radians(lng)), Math.sin(radians(lat))] as const;
  const [a, b] = [vector(from), vector(to)];
  const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  // Opposite points have no one great circle between them.
  if (parts <= 1 || Math.sin(angle) < 1e-9) return [[from[0], from[1]], unwrapped(to, from[0])];
  const line: LngLat[] = [[from[0], from[1]]];
  for (let k = 1; k < parts; k++) {
    const [wa, wb] = [Math.sin((1 - k / parts) * angle), Math.sin((k / parts) * angle)];
    const [x, y, z] = [0, 1, 2].map((i) => wa * a[i]! + wb * b[i]!) as [number, number, number];
    line.push(unwrapped([degrees(Math.atan2(y, x)), degrees(Math.atan2(z, Math.hypot(x, y)))], line[k - 1]![0]));
  }
  line.push(unwrapped(to, line.at(-1)![0]));
  return line;
}

/** The point with its longitude moved by whole turns to lie within 180° of `near`. */
const unwrapped = ([lng, lat]: LngLat, near: number): LngLat => [lng + 360 * Math.round((near - lng) / 360), lat];

/** A place on a line: on the segment from its point `segment` to the next, `t` of the way along. */
export interface PlaceOnLine {
  segment: number;
  t: number;
}

/** The place on a line nearest to a point; none on a line without a segment. */
export function placeOnLine(line: readonly LngLat[], point: LngLat): PlaceOnLine | undefined {
  const toPlane = planeAt(line);
  const p = toPlane(point);
  let best: (PlaceOnLine & { distance: number }) | undefined;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [toPlane(line[i - 1]!), toPlane(line[i]!)];
    const t = fractionOnSegment(p, a, b);
    const distance = Math.hypot(a[0] + t * (b[0] - a[0]) - p[0], a[1] + t * (b[1] - a[1]) - p[1]);
    if (!best || distance < best.distance) best = { segment: i - 1, t, distance };
  }
  return best && { segment: best.segment, t: best.t };
}

function pointAt(line: readonly LngLat[], { segment, t }: PlaceOnLine): LngLat {
  const [a, b] = [line[segment]!, line[segment + 1]!];
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** The stretch of a line between two places on it, from `from` to `to`, against the line's direction where `to` comes first. */
export function stretchBetween(line: readonly LngLat[], from: PlaceOnLine, to: PlaceOnLine): LngLat[] {
  const forward = from.segment < to.segment || (from.segment === to.segment && from.t <= to.t);
  const [first, last] = forward ? [from, to] : [to, from];
  const between = line.slice(first.segment + 1, last.segment + 1).map((p): LngLat => [p[0], p[1]]);
  const stretch = [pointAt(line, first), ...between, pointAt(line, last)];
  return forward ? stretch : stretch.reverse();
}

/** A measuring tape's course from one point to another: along `line` where it is given, else the great circle. */
export function tapeCourse(from: LngLat, to: LngLat, line?: readonly LngLat[]): LngLat[] {
  const [a, b] = line ? [placeOnLine(line, from), placeOnLine(line, to)] : [];
  return line && a && b ? stretchBetween(line, a, b) : greatCircle(from, to);
}
