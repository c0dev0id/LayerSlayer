import type { Measured } from '../geo/densify';
import type { LngLat } from '../model/route';
import { elevationColor, rainbowColor, slopeColor, surfaceColor, type RouteColoring, type Surface } from '../model/routeColoring';

/**
 * What colourings are drawn from, per drawn leg by its sample key: the elevation at each of
 * the leg's samples, and the surface of each stretch between consecutive samples.
 */
export interface ColoringData {
  elevations: ReadonlyMap<string, readonly number[]>;
  surfaces: ReadonlyMap<string, readonly Surface[]>;
}

/** A leg's samples under its sample key. */
export interface SampledLeg {
  key: string;
  samples: Measured;
}

/** A stretch of a route's line in one colour. */
export interface Piece {
  color: string;
  coordinates: LngLat[];
}

/** Metres a stretch's slope is measured over, centred on it. */
const SLOPE_WINDOW = 100;

/**
 * The pieces each drawn leg of a route is coloured in, by sample key, the legs given in
 * order. A leg the colouring has no data for yet is left out, to be drawn in the route's
 * colour; stretches without a value, such as where no elevation could be read, take
 * `fallback`.
 */
export function coloredPieces(coloring: RouteColoring, legs: readonly SampledLeg[], data: ColoringData, fallback: string): Map<string, Piece[]> {
  const pieces = new Map<string, Piece[]>();
  const length = (leg: SampledLeg) => leg.samples.distances.at(-1) ?? 0;
  const total = legs.reduce((sum, leg) => sum + length(leg), 0);
  const [lowest, highest] = elevationRange(legs, data.elevations);
  let offset = 0;
  for (const leg of legs) {
    const { distances } = leg.samples;
    const elevations = data.elevations.get(leg.key);
    const surfaces = data.surfaces.get(leg.key);
    let colors: string[] | undefined;
    if (coloring === 'rainbow') colors = stretches(distances, (i) => rainbowColor((offset + (distances[i]! + distances[i + 1]!) / 2) / total));
    else if (coloring === 'surface') colors = surfaces?.map(surfaceColor);
    else if (elevations && coloring === 'elevation') {
      colors = stretches(distances, (i) => {
        const height = (elevations[i]! + elevations[i + 1]!) / 2;
        return Number.isFinite(height) ? elevationColor((height - lowest) / (highest - lowest || 1)) : fallback;
      });
    } else if (elevations) {
      const sign = coloring === 'slope-reversed' ? -1 : 1;
      colors = grades(distances, elevations).map((grade) => (Number.isFinite(grade) ? slopeColor(sign * grade) : fallback));
    }
    if (colors) pieces.set(leg.key, joined(leg.samples.points, colors));
    offset += length(leg);
  }
  return pieces;
}

/** One value per stretch between consecutive samples. */
function stretches<T>(distances: readonly number[], value: (i: number) => T): T[] {
  return Array.from({ length: Math.max(0, distances.length - 1) }, (_, i) => value(i));
}

/** The lowest and highest elevation the legs have data for. */
export function elevationRange(legs: readonly SampledLeg[], elevations: ColoringData['elevations']): [number, number] {
  let [lowest, highest] = [Infinity, -Infinity];
  for (const leg of legs) {
    for (const height of elevations.get(leg.key) ?? []) {
      if (!Number.isFinite(height)) continue;
      lowest = Math.min(lowest, height);
      highest = Math.max(highest, height);
    }
  }
  return [lowest, highest];
}

/**
 * The grade of each stretch in percent, rising in the direction of the samples, measured
 * over SLOPE_WINDOW metres centred on it, or as much of them as the leg has.
 */
export function grades(distances: readonly number[], elevations: readonly number[]): number[] {
  const half = SLOPE_WINDOW / 2;
  const last = distances.length - 1;
  let [from, to] = [0, 0];
  return stretches(distances, (i) => {
    const middle = (distances[i]! + distances[i + 1]!) / 2;
    while (from < i && distances[from + 1]! <= middle - half) from++;
    to = Math.max(to, i + 1);
    while (to < last && distances[to]! < middle + half) to++;
    const run = distances[to]! - distances[from]!;
    return run > 0 ? ((elevations[to]! - elevations[from]!) / run) * 100 : 0;
  });
}

/** The line split into pieces where the colour of its stretches changes. */
function joined(points: readonly LngLat[], colors: readonly string[]): Piece[] {
  const pieces: Piece[] = [];
  colors.forEach((color, i) => {
    const piece = pieces.at(-1);
    if (piece?.color === color) piece.coordinates.push(points[i + 1]!);
    else pieces.push({ color, coordinates: [points[i]!, points[i + 1]!] });
  });
  return pieces;
}
