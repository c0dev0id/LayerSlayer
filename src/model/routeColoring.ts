import { within } from './stored';

/** The ways a route's line can be coloured along its length instead of in its own colour. */
export const ROUTE_COLORINGS = [
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'elevation', name: 'Elevation' },
  { id: 'slope', name: 'Slope' },
  { id: 'slope-reversed', name: 'Slope, reversed' },
  { id: 'surface', name: 'Surface' },
] as const;

export type RouteColoring = (typeof ROUTE_COLORINGS)[number]['id'];

/** Whether a stored value is a colouring; routes with one this version does not know are drawn in their colour. */
export const isRouteColoring = (value: unknown): value is RouteColoring => ROUTE_COLORINGS.some((c) => c.id === value);

/** Whether a colouring is drawn from the ground's elevation along the route. */
export const needsElevation = (coloring: RouteColoring | undefined): boolean =>
  coloring === 'elevation' || coloring === 'slope' || coloring === 'slope-reversed';

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
export function elevationColor(t: number): string {
  const at = step(t) * (ELEVATION_RAMP.length - 1);
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
