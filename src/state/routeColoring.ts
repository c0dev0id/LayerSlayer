import { createEffect, createRoot, createSignal } from 'solid-js';
import type { Measured } from '../geo/densify';
import type { Route } from '../model/route';
import { DATA_KINDS, dataOf, elevationRange, type ColoringData, type DataKind, type LegData, type RouteColoring } from '../model/routeColoring';
import { legSamples, sampleKey } from '../routing/legSamples';
import { isDrawn, legState, routeLegs } from '../routing/legs';
import { failedLegs } from '../routing/service';
import { elevationsAt } from '../services/elevation';
import { matchSurfaces, roadsAlong } from '../services/roadSurface';
import { errorMessage } from './net';
import { createPump } from './pump';
import { routeData, setRouteColoring } from './routes';

/**
 * The data route colourings are drawn from, read for the drawn legs of the routes coloured
 * by it, by sample key (a routed leg's geometry): elevations from Mapterhorn's tiles, and
 * surfaces from the roads OpenStreetMap has along them. A route's data is read once all its
 * legs are routed, for all legs missing it at once, a pump per kind; legs whose reading
 * failed are not asked for again until the colouring is chosen anew.
 */

/** Seconds between two readings of a kind, so that legs routed meanwhile are read together. */
const PAUSE_S = 1;

/** How each kind is read for a batch of legs, in their order. */
const READ: { [K in DataKind]: (legs: readonly Measured[]) => Promise<LegData[K][]> } = {
  elevation: async (legs) => {
    const heights = await elevationsAt(legs.flatMap((samples) => samples.points));
    let at = 0;
    return legs.map((samples) => heights.slice(at, (at += samples.points.length)));
  },
  surface: async (legs) => {
    const lines = legs.map((samples) => samples.points);
    return matchSurfaces(lines, await roadsAlong(lines));
  },
};

const [data, setData] = createSignal<ColoringData>({ elevation: new Map(), surface: new Map() });
/** Why reading failed, per kind and sample key. */
const [failures, setFailures] = createSignal<{ readonly [K in DataKind]: ReadonlyMap<string, string> }>({ elevation: new Map(), surface: new Map() });

/** What the route colourings are drawn from, as read so far. */
export const coloringData = data;

/** The sample keys of a route's drawn legs. */
const drawnKeys = (route: Route) =>
  routeLegs(route)
    .filter((leg) => isDrawn(route, leg))
    .map((leg) => sampleKey(route, leg));

const lacks = (kind: DataKind, key: string) => !data()[kind].has(key) && !failures()[kind].has(key);

/** The drawn legs with their samples, by sample key, that lack `kind` in routes coloured by it whose legs are all routed. */
function missing(kind: DataKind): Map<string, Measured> {
  const legs = new Map<string, Measured>();
  for (const route of routeData.routes) {
    if (dataOf(route.coloring) !== kind) continue;
    const all = routeLegs(route);
    if (all.some((leg) => legState(route, leg, failedLegs()) === 'pending')) continue;
    for (const leg of all.filter((l) => isDrawn(route, l))) {
      const key = sampleKey(route, leg);
      if (lacks(kind, key)) legs.set(key, legSamples(route, leg));
    }
  }
  return legs;
}

function createReader<K extends DataKind>(kind: K) {
  return createPump<Map<string, Measured>, LegData[K][]>({
    next: () => {
      const legs = missing(kind);
      return legs.size > 0 ? legs : undefined;
    },
    run: (legs) => READ[kind]([...legs.values()]),
    onResult: (legs, values) => {
      // Only the legs routes still draw are kept.
      const drawn = new Set(routeData.routes.flatMap(drawnKeys));
      const kept = [...data()[kind]].filter(([key]) => drawn.has(key));
      const read = [...legs.keys()].map((key, i) => [key, values[i]!] as const);
      setData((now) => ({ ...now, [kind]: new Map([...kept, ...read]) }));
    },
    onFailure: (legs, error) => {
      const reason = errorMessage(error);
      setFailures((now) => ({ ...now, [kind]: new Map([...now[kind], ...[...legs.keys()].map((key) => [key, reason] as const)]) }));
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    interval: PAUSE_S * 1000,
  });
}

const readers = { elevation: createReader('elevation'), surface: createReader('surface') };

createRoot(() => {
  createEffect(() => {
    for (const kind of DATA_KINDS) if (missing(kind).size > 0) void readers[kind]();
  });
});

/** Whether the data a route's colouring needs is still to come, and why it could not be read for some of its legs. */
export function coloringStatus(route: Route): { reading: boolean; failure?: string } {
  const kind = dataOf(route.coloring);
  if (!kind) return { reading: false };
  const keys = drawnKeys(route);
  const failure = keys.map((key) => failures()[kind].get(key)).find((reason) => reason !== undefined);
  return { reading: keys.some((key) => lacks(kind, key)), ...(failure && { failure }) };
}

/** The lowest and highest elevation read along a route, once any is. */
export function elevationSpan(route: Route): [number, number] | undefined {
  const [lowest, highest] = elevationRange(drawnKeys(route), data().elevation);
  return Number.isFinite(lowest) ? [lowest, highest] : undefined;
}

/** Lets the legs of a route whose reading failed be asked for again. */
export function retryColoring(route: Route): void {
  const keys = new Set(drawnKeys(route));
  const without = (failed: ReadonlyMap<string, string>) => new Map([...failed].filter(([key]) => !keys.has(key)));
  setFailures((now) => ({ elevation: without(now.elevation), surface: without(now.surface) }));
}

/** Colours a route's line by a colouring, or in its own colour for undefined, reading again what failed before. */
export function chooseColoring(route: Route, coloring: RouteColoring | undefined): void {
  setRouteColoring(route.id, coloring);
  retryColoring(route);
}
