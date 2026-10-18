import { densify, type Measured } from '../geo/densify';
import type { Route } from '../model/route';
import { legCoordinates, type Leg } from './legs';
import { decodePolyline } from './polyline';

/** Metres between the points a leg's colouring is worked out at, at most. */
const SPACING = 25;

/** The key of a drawn leg's colouring data: a straight leg differs from a routed one between the same points. */
export const sampleKey = (leg: Leg): string => (leg.straight ? `straight/${leg.key}` : leg.key);

/** The points a drawn leg's colouring data is aligned with: its line, with a point at least every SPACING metres. */
export function legSamples(route: Pick<Route, 'legs'>, leg: Leg, decode = decodePolyline): Measured {
  return densify(legCoordinates(route, leg, decode), SPACING);
}
