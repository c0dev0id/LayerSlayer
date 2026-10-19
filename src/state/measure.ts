import { createMemo, createRoot, createSignal } from 'solid-js';
import { lineLength, tapeCourse } from '../geo/measure';
import type { LngLat, Route } from '../model/route';
import { routePoints } from '../routing/legs';
import { routeById, routeData } from './routes';

/** An end of the measuring tape: where it lies, and the route it was laid on, if any. */
export interface TapeEnd {
  at: LngLat;
  routeId?: string;
}

/**
 * The measuring tape: from its start to its end, or on to the pointer while its end is
 * being placed. Transient: never kept, and no undo step.
 */
export interface Tape {
  start: TapeEnd;
  end?: TapeEnd;
}

export const [tape, setTape] = createSignal<Tape>();

/** Where the pointer is while the tape's end is being placed, laid on a route where it is near one. */
export const [tapeCursor, setTapeCursor] = createSignal<TapeEnd>();

/** Whether the tape's end is still to be placed: the next tap places it. */
export const placingTape = (): boolean => {
  const t = tape();
  return t !== undefined && t.end === undefined;
};

/** Lays a new tape from `start`, in place of any other, its end to be placed next. */
export function startTape(start: TapeEnd): void {
  setTapeCursor(undefined);
  setTape({ start });
}

export function moveTapeEnd(which: keyof Tape, to: TapeEnd): void {
  setTape((t) => t && { ...t, [which]: to });
}

export function removeTape(): void {
  setTape(undefined);
}

/**
 * The line of each route as drawn, which the tape is laid on: read once for all moves of
 * the pointer or an end, and again only when a route changes.
 */
export const routeLines = createRoot(() =>
  createMemo((): { id: string; line: LngLat[] }[] => routeData.routes.map((route) => ({ id: route.id, line: routePoints(route) }))),
);

/** The tape as laid out, with its length in metres: along its route where both ends lie on the same one, else straight. */
export const tapeLine = createRoot(() =>
  createMemo((): { points: LngLat[]; metres: number; route?: Route } | undefined => {
    const t = tape();
    const end = t?.end ?? tapeCursor();
    if (!t || !end) return undefined;
    const route = t.start.routeId === end.routeId ? routeById(end.routeId) : undefined;
    const points = tapeCourse(t.start.at, end.at, route && routeLines().find((r) => r.id === route.id)?.line);
    return { points, metres: lineLength(points), ...(route && { route }) };
  }),
);
