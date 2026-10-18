import { within } from './stored';

/** The ways a route's line can be coloured along its length instead of in its own colour, and the data each reads. */
export const ROUTE_COLORINGS = [
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'elevation', name: 'Elevation', reads: 'elevation' },
  { id: 'slope', name: 'Slope', reads: 'elevation' },
  { id: 'slope-reversed', name: 'Slope, reversed', reads: 'elevation' },
  { id: 'surface', name: 'Surface', reads: 'surface' },
] as const;

export type RouteColoring = (typeof ROUTE_COLORINGS)[number]['id'];

/** Whether a stored value is a colouring; routes with one this version does not know are drawn in their colour. */
export const isRouteColoring = (value: unknown): value is RouteColoring => ROUTE_COLORINGS.some((c) => c.id === value);

/** The data per drawn leg colourings are drawn from: the elevation at each sample, and the surface of each stretch between samples. */
export interface LegData {
  elevation: readonly number[];
  surface: readonly Surface[];
}

export type DataKind = keyof LegData;

export const DATA_KINDS: readonly DataKind[] = ['elevation', 'surface'];

/** The data read so far, per kind and drawn leg by its sample key. */
export type ColoringData = { readonly [K in DataKind]: ReadonlyMap<string, LegData[K]> };

/** The kind of data a colouring is drawn from, if it needs any. */
export function dataOf(coloring: RouteColoring | undefined): DataKind | undefined {
  const entry = ROUTE_COLORINGS.find((c) => c.id === coloring);
  return entry && 'reads' in entry ? entry.reads : undefined;
}

/** The lowest and highest elevation the legs have data for. */
export function elevationRange(keys: readonly string[], elevations: ColoringData['elevation']): [number, number] {
  let [lowest, highest] = [Infinity, -Infinity];
  for (const key of keys) {
    for (const height of elevations.get(key) ?? []) {
      if (!Number.isFinite(height)) continue;
      lowest = Math.min(lowest, height);
      highest = Math.max(highest, height);
    }
  }
  return [lowest, highest];
}

/** Continuous colourings come in this many steps, so that a line falls into pieces of one colour each. */
const STEPS = 32;

const step = (t: number) => Math.round(within(t, 0, 1, 0) * STEPS) / STEPS;

/** The rainbow from red at the start of the route to violet at its end; `t` is the share of its length. */
export function rainbowColor(t: number): string {
  return `hsl(${Math.round(step(t) * 280)}, 85%, 50%)`;
}

/** From the lowest point of a route to its highest. */
export const ELEVATION_RAMP = ['#2f9e44', '#94d82d', '#fcc419', '#f76707', '#c92a2a'] as const;

/** The colour of an elevation, `t` being its share of the way from the route's lowest point to its highest. */
export const elevationColor = (t: number): string => ELEVATION_STEPS[Math.round(within(t, 0, 1, 0) * STEPS)]!;

/** The ramp's colour at `t` of the way along it. */
function blend(t: number): string {
  const at = t * (ELEVATION_RAMP.length - 1);
  const i = Math.min(Math.floor(at), ELEVATION_RAMP.length - 2);
  const [from, to] = [ELEVATION_RAMP[i]!, ELEVATION_RAMP[i + 1]!];
  const channel = (k: number) => {
    const [a, b] = [parseInt(from.slice(k, k + 2), 16), parseInt(to.slice(k, k + 2), 16)];
    return Math.round(a + (b - a) * (at - i))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

const ELEVATION_STEPS = Array.from({ length: STEPS + 1 }, (_, k) => blend(k / STEPS));

/**
 * Grades in percent, in the direction of travel: each class colours the grades below
 * `below`. Descents are cool, the flat green, climbs warm.
 */
export const SLOPE_CLASSES = [
  { below: -15, color: '#364fc7' },
  { below: -10, color: '#1c7ed6' },
  { below: -6, color: '#4dabf7' },
  { below: -3, color: '#a5d8ff' },
  { below: 3, color: '#40c057' },
  { below: 6, color: '#fab005' },
  { below: 10, color: '#fd7e14' },
  { below: 15, color: '#e03131' },
  { below: Infinity, color: '#862e9c' },
] as const;

export const slopeColor = (grade: number): string => SLOPE_CLASSES.find((c) => grade < c.below)!.color;

/** What a route runs on, as OpenStreetMap's surface tags are grouped for its colours. */
export const SURFACES = [
  { id: 'paved', name: 'Paved', color: '#343a40' },
  { id: 'compacted', name: 'Compacted', color: '#fcc419' },
  { id: 'gravel', name: 'Gravel', color: '#f76707' },
  { id: 'dirt', name: 'Dirt, sand', color: '#8f5b2e' },
  { id: 'grass', name: 'Grass', color: '#37b24d' },
  { id: 'unknown', name: 'Unknown', color: '#adb5bd' },
] as const;

export type Surface = (typeof SURFACES)[number]['id'];

export const surfaceColor = (surface: Surface): string => SURFACES.find((s) => s.id === surface)!.color;
