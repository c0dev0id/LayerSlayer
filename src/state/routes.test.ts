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
        routes: [
          route('a'),
          { ...route('b'), profile: 'plane' },
          { ...route('c'), points: [{ id: 'p', lngLat: [1] }] },
        ],
        waypoints: [
          { id: 'w', routeId: 'a', name: 'W', lngLat: [1, 2] },
          { id: 'x', routeId: 'a', lngLat: [1, 2] },
          { id: 'y', name: 'Y', lngLat: [1, 2] },
          { id: 'z', routeId: 'b', name: 'Z', lngLat: [1, 2] },
          { id: 'v', routeId: 'a', name: 'V', lngLat: [1, 2], type: 'rocket' },
        ],
      }),
    );
    expect(data.routes.map((r) => r.id)).toEqual(['a']);
    // Without a name, without a route, and with a route that was dropped.
    expect(data.waypoints.map((w) => w.id)).toEqual(['w', 'v']);
    // A type this version does not know leaves a plain pin.
    expect(data.waypoints[1]).not.toHaveProperty('type');
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

  it('drops the routed legs to recalculate a route, and brings them back on undo', async () => {
    const s = await freshStore();
    s.addRoute(route('r'));
    s.appendPoint('r', [1, 1]);
    s.appendPoint('r', [2, 2]);
    s.setRouteLeg('r', 'car/1,1;2,2', 'geometry');
    s.clearRouteLegs('r');
    expect(s.routeById('r')?.legs).toEqual({});
    expect(s.undoLabel()).toBe('Recalculate route');
    s.undo();
    expect(s.routeById('r')?.legs).toEqual({ 'car/1,1;2,2': 'geometry' });
  });

  it('imports routes and waypoints as one step', async () => {
    const s = await freshStore();
    s.importRouteData({ routes: [route('a'), route('b')], waypoints: [{ id: 'w', routeId: 'a', name: 'W', lngLat: [1, 2] }] }, 'Import GPX');
    expect(s.routeData.routes).toHaveLength(2);
    expect(s.undoLabel()).toBe('Import GPX');
    s.undo();
    expect(s.routeData).toEqual({ routes: [], waypoints: [] });
  });

  it('deletes a route with its waypoints, as one step', async () => {
    const s = await freshStore();
    s.importRouteData(
      {
        routes: [route('a'), route('b')],
        waypoints: [
          { id: 'wa', routeId: 'a', name: 'A', lngLat: [1, 2] },
          { id: 'wb', routeId: 'b', name: 'B', lngLat: [3, 4] },
        ],
      },
      'Import GPX',
    );
    s.removeRoute('a');
    expect(s.routeData.routes.map((r) => r.id)).toEqual(['b']);
    expect(s.routeData.waypoints.map((w) => w.id)).toEqual(['wb']);
    expect(s.undoLabel()).toBe('Delete route');
    s.undo();
    expect(s.routeWaypoints('a').map((w) => w.id)).toEqual(['wa']);
  });

  it('makes one undo step of a colour picked or a size or width dragged in one gesture', async () => {
    const s = await freshStore();
    s.addRoute(route('r'));
    for (const color of ['#111111', '#222222', '#333333']) s.setRouteColor('r', color);
    s.endGesture();
    s.setRouteColor('r', '#444444');
    for (const size of [1.25, 1.5, 2]) s.setWaypointSize('r', size);
    s.endGesture();
    for (const width of [5, 6, 7]) s.setRouteLineWidth('r', width);
    expect(s.routeById('r')).toMatchObject({ color: '#444444', waypointSize: 2, lineWidth: 7 });
    s.undo();
    expect(s.routeById('r')?.lineWidth).toBeUndefined();
    s.undo();
    expect(s.routeById('r')).toMatchObject({ color: '#444444' });
    expect(s.routeById('r')?.waypointSize).toBeUndefined();
    s.undo();
    expect(s.routeById('r')?.color).toBe('#333333');
    s.undo();
    expect(s.routeById('r')?.color).toBe('#000');
    expect(s.undoLabel()).toBe('Draw route');
  });

  it('sets the outline and waypoint look per setting, and puts each back in one step', async () => {
    const s = await freshStore();
    s.addRoute(route('r'));
    for (const width of [2, 3]) s.setRouteOutline('r', { width });
    s.endGesture();
    s.setRouteOutline('r', { color: '#000000' });
    s.endGesture();
    s.setWaypointLook('r', { pin: '#1971c2' });
    s.endGesture();
    s.setWaypointLook('r', { size: 16 });
    expect(s.routeById('r')).toMatchObject({ outline: { width: 3, color: '#000000' }, waypointLook: { pin: '#1971c2', size: 16 } });
    s.resetWaypointLook('r');
    expect(s.routeById('r')).not.toHaveProperty('waypointLook');
    expect(s.routeById('r')).toMatchObject({ outline: { width: 3 } });
    s.undo();
    expect(s.routeById('r')).toMatchObject({ waypointLook: { pin: '#1971c2', size: 16 } });
    s.resetRouteOutline('r');
    s.resetRouteOutline('r');
    expect(s.undoLabel()).toBe('Reset outline');
    s.undo();
    expect(s.undoLabel()).toBe('Change waypoint look');
  });

  it('gives a waypoint a type in place of its symbol, and drops the type again when it is cleared', async () => {
    const s = await freshStore();
    s.addRoute(route('r'));
    s.addWaypoint({ id: 'w', routeId: 'r', lngLat: [1, 1], name: 'Lunch', description: '', icon: { id: 'maki:cafe', size: [15, 15], paths: ['M0 0h1z'] } });
    expect(s.routeData.waypoints[0]).not.toHaveProperty('description');
    s.updateWaypoint('w', { type: 'food' }, 'Edit waypoint');
    expect(s.routeData.waypoints[0]).toMatchObject({ type: 'food' });
    expect(s.routeData.waypoints[0]).not.toHaveProperty('icon');
    s.updateWaypoint('w', { type: undefined }, 'Edit waypoint');
    expect(s.routeData.waypoints[0]).not.toHaveProperty('type');
  });

  it('keeps routes in the browser', async () => {
    const s = await freshStore();
    s.addRoute(route('kept'));
    await Promise.resolve();
    const again = await freshStore();
    expect(again.routeData.routes.map((r) => r.id)).toEqual(['kept']);
  });
});
