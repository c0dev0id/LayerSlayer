import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { GRATICULE_LEVELS, graticule } from './graticule';

const isMeridian = (line: LngLat[]) => line[0]![0] === line[1]![0];

describe('graticule', () => {
  const levels = graticule([8, 48, 9, 49]);

  it('spans the world with its coarsest level', () => {
    const [coarsest] = levels;
    expect(coarsest!.minzoom).toBe(0);
    expect(coarsest!.lines).toContainEqual([[-180, 30], [180, 30]]);
    expect(coarsest!.lines.filter(isMeridian)).toHaveLength(13);
  });

  it('draws each line once, in the coarsest level it belongs to', () => {
    const at = (lng: number) => levels.filter((l) => l.lines.some((line) => isMeridian(line) && line[0]![0] === lng)).map((l) => l.minzoom);
    expect(at(30)).toEqual([0]);
    expect(at(10)).toEqual([3]);
    expect(at(8.5)).toEqual([7]);
  });

  it('keeps fine levels to the surroundings of the area', () => {
    const finest = levels.find((l) => l.minzoom === GRATICULE_LEVELS.at(-1)!.minzoom)!;
    const lngs = finest.lines.filter(isMeridian).map((line) => line[0]![0]);
    expect(Math.min(...lngs)).toBeCloseTo(8 - 40 / 60, 1);
    expect(Math.max(...lngs)).toBeCloseTo(9 + 40 / 60, 1);
  });

  it('leaves out fine levels that would need too many lines', () => {
    expect(graticule([-30, 30, 40, 70]).map((l) => l.minzoom)).not.toContain(12);
  });
});
