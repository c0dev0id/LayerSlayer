import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import type { LngLat, Route } from '../model/route';
import { focusAreaFeatures, focusAreaOverlay, focusDraftFeatures, focusDraftOverlay } from './focusOverlay';
import { withOverlays } from './overlays';
import { routeFeatures, routeOverlay } from './routeOverlay';

const corners: LngLat[] = [
  [8, 48],
  [9, 48],
  [9, 49],
];

const route: Route = {
  id: 'r',
  name: 'Tour',
  profile: 'car',
  color: '#e8590c',
  points: [
    { id: 'a', lngLat: [1, 1] },
    { id: 'b', lngLat: [2, 2], straight: true },
  ],
  legs: {},
};

describe('withOverlays', () => {
  it('adds the overlays in order on top of the composed style without changing it', () => {
    const style: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }] };
    const overlays = [
      { ...focusAreaOverlay, data: () => focusAreaFeatures(corners) },
      { ...focusDraftOverlay, data: () => focusDraftFeatures(corners, [8.5, 48.5]) },
      { ...routeOverlay, data: () => routeFeatures([route], new Set()) },
    ];
    const result = withOverlays(style, overlays);
    expect(validateStyleMin(result)).toEqual([]);
    expect(Object.keys(result.sources)).toEqual(overlays.map((o) => o.id));
    expect(result.sources[routeOverlay.id]).toMatchObject({ attribution: routeOverlay.attribution });
    expect(result.layers.map((l) => ('source' in l ? l.source : l.id))).toEqual([
      'bg',
      ...overlays.flatMap((o) => o.layers.map(() => o.id)),
    ]);
    expect(style.layers).toHaveLength(1);
  });
});
