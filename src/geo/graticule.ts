import type { Bounds } from '../model/layer';
import type { LngLat } from '../model/route';
import { MAX_LATITUDE } from './mercator';

/**
 * The levels of the graticule, coarse to fine: the spacing of their lines in minutes of arc,
 * each a multiple of the next, and the map zoom from which they are about 100 px apart.
 */
export const GRATICULE_LEVELS = [
  { minutes: 1800, minzoom: 0 },
  { minutes: 600, minzoom: 3 },
  { minutes: 300, minzoom: 4 },
  { minutes: 60, minzoom: 6 },
  { minutes: 30, minzoom: 7 },
  { minutes: 10, minzoom: 9 },
  { minutes: 5, minzoom: 10 },
  { minutes: 1, minzoom: 12 },
] as const;

/** How many of its lines a level draws beyond the area on each side. */
const MARGIN_LINES = 40;
/** Most lines a level may have; finer levels around a large area are left out. */
const MAX_LINES = 1500;

/** The whole multiples of `step` from `from` to `to`, in minutes. */
function multiples(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) values.push(m);
  return values;
}

/**
 * The meridians and parallels around `area`, by level, each line in the coarsest level it
 * belongs to. A level reaches its margin of lines beyond the area, so coarse levels span
 * the world and fine ones only the area's surroundings, where the map shows them.
 */
export function graticule(area: Bounds): { minzoom: number; lines: LngLat[][] }[] {
  const limit = Math.floor(MAX_LATITUDE * 60);
  return GRATICULE_LEVELS.flatMap(({ minutes, minzoom }, i) => {
    const margin = MARGIN_LINES * minutes;
    const west = Math.max(-180 * 60, area[0] * 60 - margin);
    const east = Math.min(180 * 60, area[2] * 60 + margin);
    const south = Math.max(-limit, area[1] * 60 - margin);
    const north = Math.min(limit, area[3] * 60 + margin);
    const coarser = GRATICULE_LEVELS[i - 1]?.minutes;
    const own = (m: number) => coarser === undefined || m % coarser !== 0;
    const meridians = multiples(west, east, minutes).filter(own);
    const parallels = multiples(south, north, minutes).filter(own);
    if (meridians.length + parallels.length > MAX_LINES) return [];
    const lines = [
      ...meridians.map((m): LngLat[] => [[m / 60, south / 60], [m / 60, north / 60]]),
      ...parallels.map((m): LngLat[] => [[west / 60, m / 60], [east / 60, m / 60]]),
    ];
    return [{ minzoom, lines }];
  });
}
