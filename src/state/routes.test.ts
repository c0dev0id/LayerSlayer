import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '../model/route';

/** A fresh store per test: the module keeps its state and history at module level. */
async function freshStore() {
  vi.resetModules();
  return import('./routes');
}

const route = (id: string): Route => ({ id, name: id, profile: 'car', color: '#000', points: [], legs: {} });

beforeEach(() => localStorage.clear());

describe('parseRouteData', () => {
  it('keeps valid routes and waypoints and drops the rest one by one', async () => {
    const { parseRouteData } = await freshStore();
    const data = parseRouteData(
      JSON.stringify({
        routes: [route('a'), { ...route('b'), profile: 'plane' }, { ...route('c'), points: [{ id: 'p', lngLat: [1] }] }],
        waypoints: [{ id: 'w', name: 'W', lngLat: [1, 2] }, { id: 'x', lngLat: [1, 2] }],
      }),
    );
    expect(data.routes.map((r) => r.id)).toEqual(['a']);
    expect(data.waypoints.map((w) => w.id)).toEqual(['w']);
    expect(parseRouteData('{}')).toEqual({ routes: [], waypoints: [] });
  });
});

describe('route history', () => {
  it('undoes and redoes edits, but not routing results', async () => {
    const s = await freshStore();
    s.addRoute(route('r'));
    s.appendPoint('r', [1, 1]);
    s.appendPoint('r', [2, 2]);
    s.setRouteLeg('r', 'car/1,1;2,2', 'geometry');
    expect(s.undoLabel()).toBe('Add point');
    s.undo();
    expect(s.routeById('r')?.points).toHaveLength(1);
    s.redo();
    expect(s.routeById('r')?.points).toHaveLength(2);
    s.undo();
    s.undo();
    s.undo();
    expect(s.routeData.routes).toEqual([]);
    expect(s.undoLabel()).toBeUndefined();
  });

  it('imports routes and waypoints as one step', async () => {
    const s = await freshStore();
    s.importRouteData({ routes: [route('a'), route('b')], waypoints: [{ id: 'w', name: 'W', lngLat: [1, 2] }] }, 'Import GPX');
    expect(s.routeData.routes).toHaveLength(2);
    expect(s.undoLabel()).toBe('Import GPX');
    s.undo();
    expect(s.routeData).toEqual({ routes: [], waypoints: [] });
  });

  it('keeps routes in the browser', async () => {
    const s = await freshStore();
    s.addRoute(route('kept'));
    await Promise.resolve();
    const again = await freshStore();
    expect(again.routeData.routes.map((r) => r.id)).toEqual(['kept']);
  });
});
