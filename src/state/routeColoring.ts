import { createMemo, createRoot, createSignal } from 'solid-js';
import type { ColoringData } from '../map/routeColoring';
import type { Surface } from '../model/routeColoring';

/** Elevations and surfaces read for the drawn legs of routes coloured by them, by sample key. */
const [elevations, setElevations] = createSignal<ReadonlyMap<string, readonly number[]>>(new Map());
const [surfaces, setSurfaces] = createSignal<ReadonlyMap<string, readonly Surface[]>>(new Map());

/** What the route colourings are drawn from, as read so far. */
export const coloringData = createRoot(() => createMemo((): ColoringData => ({ elevations: elevations(), surfaces: surfaces() })));

export { setElevations, setSurfaces };
