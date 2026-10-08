import { describe, expect, it } from 'vitest';
import type { Route } from '../model/route';
import { routeFeatures } from './routeOverlay';

const route: Route = {
  id: 'r',
  name: 'Tour',
  profile: 'car',
  color: '#e8590c',
  points: [
    { id: 'a', lngLat: [1, 1] },
    { id: 'b', lngLat: [2, 2] },
    { id: 'c', lngLat: [3, 3] },
    { id: 'd', lngLat: [4, 4], straight: true },
  ],
  // [[1,1],[1.5,1.5],[2,2]] in polyline6
  legs: { 'car/1,1;2,2': '_c`|@_c`|@_qo]_qo]_qo]_qo]' },
};

describe('routeFeatures', () => {
  it('draws routed, pending, failed and straight legs', () => {
    const lines = routeFeatures([route], new Set(['car/2,2;3,3']));
    expect(lines.features.map((f) => f.properties)).toEqual([
      { state: 'routed', color: '#e8590c' },
      { state: 'failed', color: '#e8590c' },
      { state: 'straight', color: '#e8590c' },
    ]);
    expect(lines.features[0]!.geometry.coordinates).toEqual([
      [1, 1],
      [1.5, 1.5],
      [2, 2],
    ]);
    expect(routeFeatures([route], new Set()).features[1]!.properties).toMatchObject({ state: 'pending' });
  });
});
