import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import { distanceBetween, greatCircle, lineLength, placeOnLine, stretchBetween, tapeCourse } from './measure';

const FRANKFURT: LngLat = [8.6821, 50.1109];
const BERLIN: LngLat = [13.405, 52.52];
const NEW_YORK: LngLat = [-74.006, 40.7128];

describe('distanceBetween and lineLength', () => {
  it('measures on a sphere of the Earth\'s mean radius', () => {
    expect(distanceBetween([0, 0], [0, 1])).toBeCloseTo(111_195, 0);
    expect(distanceBetween([0, 0], [1, 0])).toBeCloseTo(111_195, 0);
    // A degree of longitude shrinks towards the poles.
    expect(distanceBetween([0, 60], [1, 60])).toBeCloseTo(55_597, 0);
    expect(distanceBetween(FRANKFURT, BERLIN) / 1000).toBeCloseTo(423.5, 0);
    expect(distanceBetween(BERLIN, BERLIN)).toBe(0);
  });

  it('adds up the segments of a line', () => {
    expect(lineLength([[0, 0], [0, 1], [1, 1]])).toBeCloseTo(distanceBetween([0, 0], [0, 1]) + distanceBetween([0, 1], [1, 1]), 6);
    expect(lineLength([[0, 0]])).toBe(0);
  });
});

describe('greatCircle', () => {
  it('is a straight line between near points', () => {
    expect(greatCircle(FRANKFURT, [8.7, 50.12])).toEqual([FRANKFURT, [8.7, 50.12]]);
  });

  it('bends between far points, with points at most 20 km apart and its own ends', () => {
    const arc = greatCircle(FRANKFURT, NEW_YORK);
    expect(arc[0]).toEqual(FRANKFURT);
    expect(arc.at(-1)).toEqual(NEW_YORK);
    expect(arc.slice(1).every((p, i) => distanceBetween(arc[i]!, p) <= 20_000.001)).toBe(true);
    expect(lineLength(arc)).toBeCloseTo(distanceBetween(FRANKFURT, NEW_YORK), -2);
    // Northwards of the straight line on a Mercator map.
    expect(Math.max(...arc.map(([, lat]) => lat))).toBeGreaterThan(52);
  });

  it('runs on past 180° the short way round', () => {
    const arc = greatCircle([170, 10], [-170, 10]);
    expect(arc.at(-1)).toEqual([190, 10]);
    expect(arc.slice(1).every((p, i) => Math.abs(p[0] - arc[i]![0]) < 1)).toBe(true);
  });
});

describe('places and stretches on a line', () => {
  const line: LngLat[] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ];

  it('finds the place on the line nearest a point', () => {
    expect(placeOnLine(line, [1.5, 0.1])).toEqual({ segment: 1, t: expect.closeTo(0.5, 6) });
    expect(placeOnLine(line, [-1, 0])).toEqual({ segment: 0, t: 0 });
    expect(placeOnLine([[1, 1]], [1, 1])).toBeUndefined();
  });

  it('cuts the stretch between two places, either way along the line', () => {
    const from = { segment: 0, t: 0.5 };
    const to = { segment: 2, t: 0.5 };
    expect(stretchBetween(line, from, to)).toEqual([[0.5, 0], [1, 0], [2, 0], [2, 0.5]]);
    expect(stretchBetween(line, to, from)).toEqual([[2, 0.5], [2, 0], [1, 0], [0.5, 0]]);
    expect(stretchBetween(line, { segment: 1, t: 0.75 }, { segment: 1, t: 0.25 })).toEqual([[1.75, 0], [1.25, 0]]);
  });

  it('lays a tape along a line where one is given, else on the great circle', () => {
    expect(tapeCourse([0.5, 0.1], [2.1, 0.5], line)).toEqual([[0.5, 0], [1, 0], [2, 0], [2, 0.5]]);
    expect(tapeCourse([0.5, 0], [2, 0.5])).toEqual(greatCircle([0.5, 0], [2, 0.5]));
    expect(tapeCourse([0.5, 0], [2, 0.5], [[1, 1]])).toEqual(greatCircle([0.5, 0], [2, 0.5]));
  });
});
