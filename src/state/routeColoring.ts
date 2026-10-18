import { createEffect, createMemo, createRoot, createSignal } from 'solid-js';
import type { Measured } from '../geo/densify';
import { elevationRange, type ColoringData } from '../map/routeColoring';
import type { Route } from '../model/route';
import { needsElevation, type RouteColoring, type Surface } from '../model/routeColoring';
import { legSamples, sampleKey } from '../routing/legSamples';
import { routeLegs } from '../routing/legs';
import { elevationsAt } from '../services/elevation';
import { matchSurfaces, roadsAlong } from '../services/roadSurface';
import { errorMessage } from './net';
import { routeData } from './routes';

/**
 * The data route colourings are drawn from, read for the drawn legs of the routes coloured
 * by it, by sample key (a routed leg's geometry): elevations from Mapterhorn's tiles, and surfaces from the roads
 * OpenStreetMap has along them. Each kind is read for all legs missing it at once, one
 * reading at a time; legs whose reading failed are not asked for again until the colouring
 * is chosen anew.
 */

type Kind = 'elevation' | 'surface';

const [elevations, setElevations] = createSignal<ReadonlyMap<string, readonly number[]>>(new Map());
const [surfaces, setSurfaces] = createSignal<ReadonlyMap<string, readonly Surface[]>>(new Map());
/** Why reading a kind failed for a leg, by kind and sample key. */
const [failures, setFailures] = createSignal<ReadonlyMap<string, string>>(new Map());
const [reading, setReading] = createSignal<ReadonlySet<Kind>>(new Set());

/** What the route colourings are drawn from, as read so far. */
export const coloringData = createRoot(() => createMemo((): ColoringData => ({ elevations: elevations(), surfaces: surfaces() })));

const failureKey = (kind: Kind, key: string) => `${kind} ${key}`;

/** The kind of data a colouring is drawn from, if it needs any. */
const kindOf = (coloring: RouteColoring | undefined): Kind | undefined => (needsElevation(coloring) ? 'elevation' : coloring === 'surface' ? 'surface' : undefined);

const have = (kind: Kind): ReadonlyMap<string, unknown> => (kind === 'elevation' ? elevations() : surfaces());

/** The drawn legs of the route, with their sample keys: routed ones whose geometry has arrived, and straight ones. */
function drawnLegs(route: Route) {
  return routeLegs(route)
    .filter((leg) => leg.straight || leg.key in route.legs)
    .map((leg) => ({ leg, key: sampleKey(route, leg) }));
}

/** The drawn legs of the routes coloured from `kind` that lack it and have not failed, with their samples. */
function missing(kind: Kind): Map<string, Measured> {
  const known = have(kind);
  const legs = new Map<string, Measured>();
  for (const route of routeData.routes) {
    if (kindOf(route.coloring) !== kind) continue;
    for (const { leg, key } of drawnLegs(route)) {
      if (!known.has(key) && !failures().has(failureKey(kind, key)) && !legs.has(key)) legs.set(key, legSamples(route, leg));
    }
  }
  return legs;
}

/** The map with the additions, keeping only the legs routes still draw. */
function updated<T>(map: ReadonlyMap<string, T>, additions: ReadonlyMap<string, T>): Map<string, T> {
  const drawn = new Set(routeData.routes.flatMap((route) => drawnLegs(route).map(({ key }) => key)));
  return new Map([...[...map].filter(([key]) => drawn.has(key)), ...additions]);
}

async function readElevations(legs: ReadonlyMap<string, Measured>): Promise<void> {
  const heights = await elevationsAt([...legs.values()].flatMap((samples) => samples.points));
  let at = 0;
  const found = new Map([...legs].map(([key, samples]) => [key, heights.slice(at, (at += samples.points.length))]));
  setElevations((now) => updated(now, found));
}

async function readSurfaces(legs: ReadonlyMap<string, Measured>): Promise<void> {
  const lines = [...legs.values()].map((samples) => samples.points);
  const matched = matchSurfaces(lines, await roadsAlong(lines));
  const found = new Map([...legs.keys()].map((key, i) => [key, matched[i]!]));
  setSurfaces((now) => updated(now, found));
}

async function read(kind: Kind, legs: ReadonlyMap<string, Measured>): Promise<void> {
  setReading((now) => new Set(now).add(kind));
  try {
    await (kind === 'elevation' ? readElevations(legs) : readSurfaces(legs));
  } catch (error) {
    const reason = errorMessage(error);
    setFailures((now) => new Map([...now, ...[...legs.keys()].map((key) => [failureKey(kind, key), reason] as const)]));
  } finally {
    setReading((now) => {
      const next = new Set(now);
      next.delete(kind);
      return next;
    });
  }
}

createRoot(() => {
  createEffect(() => {
    for (const kind of ['elevation', 'surface'] as const) {
      if (reading().has(kind)) continue;
      const legs = missing(kind);
      if (legs.size > 0) void read(kind, legs);
    }
  });
});

/** Whether the data a route's colouring needs is being read, and why it could not be read for some of its legs. */
export function coloringStatus(route: Route): { reading: boolean; failure?: string } {
  const kind = kindOf(route.coloring);
  if (!kind) return { reading: false };
  const keys = drawnLegs(route).map(({ key }) => key);
  const failure = keys.map((key) => failures().get(failureKey(kind, key))).find((reason) => reason !== undefined);
  const known = have(kind);
  return { reading: keys.some((key) => !known.has(key) && !failures().has(failureKey(kind, key))), ...(failure && { failure }) };
}

/** The lowest and highest elevation read along a route, once any is. */
export function elevationSpan(route: Route): [number, number] | undefined {
  const [lowest, highest] = elevationRange(drawnLegs(route), elevations());
  return Number.isFinite(lowest) ? [lowest, highest] : undefined;
}

/** Lets the legs of a route whose reading failed be asked for again. */
export function retryColoring(route: Route): void {
  const keys = new Set(drawnLegs(route).map(({ key }) => key));
  setFailures((now) => new Map([...now].filter(([id]) => !keys.has(id.slice(id.indexOf(' ') + 1)))));
}
