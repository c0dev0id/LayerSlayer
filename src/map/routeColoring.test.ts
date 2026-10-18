import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import type { ColoringData } from '../model/routeColoring';
import { coloredPieces, grades, type SampledLeg } from './routeColoring';

/** A leg along the equator with a sample every 25 m from `start` metres east. */
function leg(key: string, start: number, count: number): SampledLeg {
  const distances = Array.from({ length: count }, (_, i) => i * 25);
  const points = distances.map((d): LngLat => [(start + d) / 111_320, 0]);
  return { key, samples: { points, distances } };
}

const none: ColoringData = { elevation: new Map(), surface: new Map() };

describe('coloredPieces', () => {
  it('runs the rainbow over the whole route, legs one after the other', () => {
    const legs = [leg('a', 0, 41), leg('b', 1000, 41)];
    const pieces = coloredPieces('rainbow', legs, none, '#000000');
    expect(pieces.get('a')![0]!.color).toBe('hsl(0, 85%, 50%)');
    expect(pieces.get('b')!.at(-1)!.color).toBe('hsl(280, 85%, 50%)');
    // Neighbouring stretches of one colour make one piece, sharing their ends with the next.
    const a = pieces.get('a')!;
    expect(a.length).toBeLessThan(40);
    expect(a[1]!.coordinates[0]).toEqual(a[0]!.coordinates.at(-1));
  });

  it('spans the elevation colours over the route’s own range, and leaves out legs without elevations', () => {
    const legs = [leg('a', 0, 3), leg('b', 50, 3)];
    const data = { ...none, elevation: new Map([['a', [300, 300, 300]]]) };
    const pieces = coloredPieces('elevation', legs, data, '#000000');
    expect(pieces.get('a')).toEqual([{ color: '#2f9e44', coordinates: legs[0]!.samples.points }]);
    expect(pieces.has('b')).toBe(false);
    const both = coloredPieces('elevation', legs, { ...none, elevation: new Map([['a', [300, 300, 300]], ['b', [500, 500, Number.NaN]]]) }, '#000000');
    expect(both.get('b')!.map((p) => p.color)).toEqual(['#c92a2a', '#000000']);
  });

  it('colours slopes in the direction of travel, or against it when reversed', () => {
    // 10 % up over the whole leg.
    const legs = [leg('a', 0, 9)];
    const data = { ...none, elevation: new Map([['a', [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20]]]) };
    expect(coloredPieces('slope', legs, data, '#000000').get('a')!.map((p) => p.color)).toEqual(['#e03131']);
    expect(coloredPieces('slope-reversed', legs, data, '#000000').get('a')!.map((p) => p.color)).toEqual(['#4dabf7']);
  });

  it('colours each stretch by its surface', () => {
    const legs = [leg('a', 0, 4)];
    const data = { ...none, surface: new Map([['a', ['paved', 'gravel', 'gravel'] as const]]) };
    expect(coloredPieces('surface', legs, data, '#000000').get('a')!.map((p) => [p.color, p.coordinates.length])).toEqual([
      ['#343a40', 2],
      ['#f76707', 3],
    ]);
  });
});

describe('grades', () => {
  it('measures from the samples around 100 m centred on each stretch, or as far as the leg goes', () => {
    const distances = [0, 25, 50, 75, 100, 125, 150];
    const elevations = [0, 0, 0, 0, 10, 20, 30];
    const result = grades(distances, elevations);
    expect(result).toHaveLength(6);
    // The first stretch sees 0–75 m: flat. The third, centred at 62.5 m, sees 0–125 m: 20 m up.
    expect(result[0]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(16);
    expect(result[5]).toBeCloseTo((30 - 0) / 75 * 100);
  });
});
