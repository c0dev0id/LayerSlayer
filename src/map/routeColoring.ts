import type { Measured } from '../geo/densify';
import type { LngLat } from '../model/route';
import { elevationColor, elevationRange, rainbowColor, slopeColor, surfaceColor, type ColoringData, type RouteColoring } from '../model/routeColoring';

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

/** The middle between each two consecutive values. */
const middles = (values: readonly number[]) => values.slice(1).map((value, i) => (values[i]! + value) / 2);

/**
 * The pieces each drawn leg of a route is coloured in, in the order of the legs given. A
 * leg the colouring has no data for yet has none, to be drawn in the route's colour;
 * stretches without a value, such as where no elevation could be read, take `fallback`.
 */
export function coloredPieces(coloring: RouteColoring, legs: readonly SampledLeg[], data: ColoringData, fallback: string): (Piece[] | undefined)[] {
  const length = (leg: SampledLeg) => leg.samples.distances.at(-1) ?? 0;
  const total = legs.reduce((sum, leg) => sum + length(leg), 0);
  const [lowest, highest] = coloring === 'elevation' ? elevationRange(legs.map((leg) => leg.key), data.elevation) : [0, 0];
  const colorsOf = ({ key, samples: { distances } }: SampledLeg, offset: number): string[] | undefined => {
    const elevations = data.elevation.get(key);
    switch (coloring) {
      case 'rainbow':
        return middles(distances).map((distance) => rainbowColor((offset + distance) / total));
      case 'surface':
        return data.surface.get(key)?.map(surfaceColor);
      case 'elevation':
        return elevations && middles(elevations).map((height) => (Number.isFinite(height) ? elevationColor((height - lowest) / (highest - lowest || 1)) : fallback));
      case 'slope':
      case 'slope-reversed': {
        const sign = coloring === 'slope' ? 1 : -1;
        return elevations && grades(distances, elevations).map((grade) => (Number.isFinite(grade) ? slopeColor(sign * grade) : fallback));
      }
    }
  };
  let offset = 0;
  return legs.map((leg) => {
    const colors = colorsOf(leg, offset);
    offset += length(leg);
    return colors && joined(leg.samples, colors);
  });
}

/**
 * The grade of each stretch in percent, rising in the direction of the samples, measured
 * from the samples around SLOPE_WINDOW metres centred on it, or as far as the leg goes.
 */
export function grades(distances: readonly number[], elevations: readonly number[]): number[] {
  const half = SLOPE_WINDOW / 2;
  return middles(distances).map((middle, i) => {
    let [from, to] = [i, i + 1];
    while (from > 0 && distances[from]! > middle - half) from--;
    while (to < distances.length - 1 && distances[to]! < middle + half) to++;
    const run = distances[to]! - distances[from]!;
    return run > 0 ? ((elevations[to]! - elevations[from]!) / run) * 100 : 0;
  });
}

/**
 * The line split into pieces where the colour of its stretches changes. Within a piece, the
 * points added between the line's own are left out: they lie on the straight between them.
 */
function joined({ points, original }: Measured, colors: readonly string[]): Piece[] {
  const pieces: Piece[] = [];
  colors.forEach((color, i) => {
    const piece = pieces.at(-1);
    if (piece?.color !== color) {
      pieces.push({ color, coordinates: [points[i]!, points[i + 1]!] });
      return;
    }
    if (!original[i]) piece.coordinates.pop();
    piece.coordinates.push(points[i + 1]!);
  });
  return pieces;
}
