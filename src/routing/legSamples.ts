import { densify, type Measured } from '../geo/densify';
import type { Route } from '../model/route';
import { legCoordinates, type Leg } from './legs';
import { decodePolyline } from './polyline';

/** Metres between the points a leg's colouring is worked out at, at most. */
const SPACING = 25;

/**
 * The key of a drawn leg's colouring data: its routed geometry, which a leg routed anew may
 * change while its routing key stays, or its ends for a straight leg, whatever the profile.
 */
export const sampleKey = (route: Pick<Route, 'legs'>, leg: Leg): string =>
  leg.straight ? `straight/${leg.from.join(',')};${leg.to.join(',')}` : (route.legs[leg.key] ?? leg.key);

/** Samples asked for since the cache last turned, and in the turn before. */
let [current, previous] = [new Map<string, Measured>(), new Map<string, Measured>()];

/**
 * The points a drawn leg's colouring data is aligned with: its line, with a point at least
 * every SPACING metres. The colouring readers and the route overlay share them by sample key.
 */
export function legSamples(route: Pick<Route, 'legs'>, leg: Leg, decode = decodePolyline): Measured {
  const key = sampleKey(route, leg);
  const samples = current.get(key) ?? previous.get(key) ?? densify(legCoordinates(route, leg, decode), SPACING);
  current.set(key, samples);
  return samples;
}

/** Forgets the samples nobody asked for during a whole turn; the route overlay turns the cache each time it draws. */
export function turnSampleCache(): void {
  [previous, current] = [current, new Map()];
}
