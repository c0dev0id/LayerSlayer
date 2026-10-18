import { describe, expect, it, vi } from 'vitest';

const elevationsAt = vi.fn();
vi.mock('../services/elevation', () => ({ elevationsAt: (points: unknown[]) => elevationsAt(points), ELEVATION_TILES: '' }));
vi.mock('../services/roadSurface', () => ({
  roadsAlong: async () => [],
  matchSurfaces: (lines: unknown[][]) => lines.map((line) => line.slice(1).map(() => 'paved')),
}));
// Routing never answers, so that a routed leg stays pending.
vi.mock('../routing/osrm', async (original) => ({ ...(await original<object>()), fetchLeg: () => new Promise(() => {}) }));

const { addRoute, routeById, setRouteLeg } = await import('./routes');
const { chooseColoring, coloringData, coloringStatus } = await import('./routeColoring');

const settled = (check: () => void) => vi.waitFor(check, { timeout: 4000, interval: 20 });

describe('route colouring data', () => {
  it('reads a route once its legs are routed, reports failures and reads again when chosen anew', async () => {
    addRoute({
      id: 'r',
      name: 'Tour',
      profile: 'car',
      color: '#e8590c',
      points: [
        { id: 'a', lngLat: [7, 49] },
        { id: 'b', lngLat: [7.001, 49] },
        { id: 'c', lngLat: [7.002, 49], straight: true },
      ],
      legs: {},
    });
    const route = () => routeById('r')!;
    elevationsAt.mockRejectedValueOnce(new Error('down'));
    chooseColoring(route(), 'elevation');
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The straight leg is drawn at once, but nothing is read while the other waits for routing.
    expect(elevationsAt).not.toHaveBeenCalled();

    // [[7,49],[7.001,49]] in polyline6.
    setRouteLeg('r', 'car/7,49;7.001,49', '_cvm|A_{fjL?o}@');
    await settled(() => expect(coloringStatus(route())).toEqual({ reading: false, failure: 'down' }));
    // Both legs in one reading.
    expect(elevationsAt).toHaveBeenCalledTimes(1);

    elevationsAt.mockImplementation(async (points: unknown[]) => points.map(() => 100));
    chooseColoring(route(), 'elevation');
    await settled(() => expect(coloringStatus(route())).toEqual({ reading: false }));
    expect([...coloringData().elevation.values()][0]!.every((height) => height === 100)).toBe(true);

    chooseColoring(route(), 'surface');
    await settled(() => expect(coloringData().surface.size).toBe(2));
    expect(coloringStatus(route())).toEqual({ reading: false });
  });
});
