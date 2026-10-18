import { describe, expect, it } from 'vitest';
import type { Route } from '../model/route';
import type { ColoringData } from './routeColoring';
import { routeFeatures } from './routeOverlay';

const NO_DATA: ColoringData = { elevations: new Map(), surfaces: new Map() };

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
    const lines = routeFeatures([route], new Set(['car/2,2;3,3']), NO_DATA);
    expect(lines.features.map((f) => f.properties)).toEqual([
      { state: 'routed', color: '#e8590c', width: 4, outlineColor: '#ffffff', outlineWidth: 1.5 },
      { state: 'failed', color: '#e8590c', width: 4, outlineColor: '#ffffff', outlineWidth: 1.5 },
      { state: 'straight', color: '#e8590c', width: 4, outlineColor: '#ffffff', outlineWidth: 1.5 },
    ]);
    expect(lines.features[0]!.geometry.coordinates).toEqual([
      [1, 1],
      [1.5, 1.5],
      [2, 2],
    ]);
    expect(routeFeatures([route], new Set(), NO_DATA).features[1]!.properties).toMatchObject({ state: 'pending' });
  });

  it('draws a route in its own line width', () => {
    const lines = routeFeatures([{ ...route, lineWidth: 7.5 }], new Set(), NO_DATA);
    expect(lines.features.map((f) => f.properties!['width'])).toEqual([7.5, 7.5, 7.5]);
    // Whatever a project file says is kept within the slider's bounds.
    expect(routeFeatures([{ ...route, lineWidth: 500 }], new Set(), NO_DATA).features[0]!.properties!['width']).toBe(10);
  });

  it('draws the legs of a coloured route in pieces, over the legs it outlines', () => {
    const lines = routeFeatures([{ ...route, coloring: 'rainbow' }], new Set(), NO_DATA);
    const legs = lines.features.filter((f) => f.properties!['state'] !== 'piece');
    expect(legs.map((f) => [f.properties!['state'], f.properties!['colored']])).toEqual([
      ['routed', true],
      ['pending', undefined],
      ['straight', true],
    ]);
    const pieces = lines.features.filter((f) => f.properties!['state'] === 'piece');
    expect(pieces[0]!.properties).toEqual({ state: 'piece', color: 'hsl(0, 85%, 50%)', width: 4 });
    expect(pieces.at(-1)!.properties!['color']).toBe('hsl(280, 85%, 50%)');
    expect(pieces.at(-1)!.geometry.coordinates.at(-1)).toEqual([4, 4]);
    // Without its elevations yet, an elevation-coloured route is drawn in its colour.
    expect(routeFeatures([{ ...route, coloring: 'elevation' }], new Set(), NO_DATA).features.some((f) => f.properties!['colored'])).toBe(false);
  });

  it('outlines a route in its own colour and width, within bounds', () => {
    expect(routeFeatures([{ ...route, outline: { color: '#000000', width: 3 } }], new Set(), NO_DATA).features[0]!.properties).toMatchObject({ outlineColor: '#000000', outlineWidth: 3 });
    expect(routeFeatures([{ ...route, outline: { color: 'black', width: 50 } }], new Set(), NO_DATA).features[0]!.properties).toMatchObject({ outlineColor: '#ffffff', outlineWidth: 4 });
  });
});
