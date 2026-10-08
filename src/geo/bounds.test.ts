import { describe, expect, it } from 'vitest';
import { allOutside, cornersBounds, geojsonBounds, intersectBounds } from './bounds';

describe('geojsonBounds', () => {
  it('covers all coordinates of all features', () => {
    expect(
      geojsonBounds({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [7, 47] } },
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8, 48], [9, 46]] } },
        ],
      }),
    ).toEqual([7, 46, 9, 48]);
  });

  it('gives a tiny box for a single point and nothing for no coordinates', () => {
    expect(geojsonBounds({ type: 'Point', coordinates: [7, 47] })![0]).toBe(7);
    expect(geojsonBounds({ type: 'FeatureCollection', features: [] })).toBeUndefined();
  });
});

describe('cornersBounds', () => {
  it('covers four corners', () => {
    expect(cornersBounds([[7, 47.2], [7.2, 47.2], [7.2, 47], [7, 47]])).toEqual([7, 47, 7.2, 47.2]);
  });
});

describe('intersectBounds', () => {
  it('gives the overlap, and nothing for bounds that only touch or lie apart', () => {
    expect(intersectBounds([0, 0, 10, 10], [5, -5, 15, 5])).toEqual([5, 0, 10, 5]);
    expect(intersectBounds([0, 0, 10, 10], [10, 0, 20, 10])).toBeUndefined();
    expect(intersectBounds([0, 0, 1, 1], [5, 5, 6, 6])).toBeUndefined();
  });
});

describe('allOutside', () => {
  it('holds only for known areas that all miss the box', () => {
    const box: [number, number, number, number] = [8, 48, 9, 49];
    expect(allOutside([[0, 0, 1, 1], [20, 20, 21, 21]], box)).toBe(true);
    expect(allOutside([[0, 0, 1, 1], [8.5, 48.5, 10, 50]], box)).toBe(false);
    expect(allOutside(undefined, box)).toBe(false);
    expect(allOutside([], box)).toBe(false);
  });
});
