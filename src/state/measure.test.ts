import { beforeEach, describe, expect, it, vi } from 'vitest';
import { greatCircle } from '../geo/measure';
import type { Route } from '../model/route';

/** Fresh stores per test: the modules keep their state at module level. */
async function fresh() {
  vi.resetModules();
  return { ...(await import('./routes')), ...(await import('./measure')) };
}

// From (0, 0) east to (1, 0), then north to (1, 1), in straight legs that need no routing.
const route = (id: string): Route => ({
  id,
  name: id,
  profile: 'car',
  color: '#000',
  points: [
    { id: 'a', lngLat: [0, 0] },
    { id: 'b', lngLat: [1, 0], straight: true },
    { id: 'c', lngLat: [1, 1], straight: true },
  ],
  legs: {},
});

beforeEach(() => localStorage.clear());

describe('the measuring tape', () => {
  it('runs on to the pointer while its end is placed, then to its end', async () => {
    const s = await fresh();
    s.startTape({ at: [0, 0] });
    expect(s.placingTape()).toBe(true);
    expect(s.tapeLine()).toBeUndefined();
    s.setTapeCursor({ at: [0, 1] });
    expect(s.tapeLine()?.metres).toBeCloseTo(111_195, 0);
    s.moveTapeEnd('end', { at: [0, 2] });
    expect(s.placingTape()).toBe(false);
    expect(s.tapeLine()?.metres).toBeCloseTo(2 * 111_195, 0);
    s.removeTape();
    expect(s.tape()).toBeUndefined();
  });

  it('follows a route from one of its points to another, and goes straight otherwise', async () => {
    const s = await fresh();
    s.addRoute(route('r'));
    s.addRoute(route('q'));
    s.startTape({ at: [0.5, 0], routeId: 'r' });
    s.moveTapeEnd('end', { at: [1, 0.5], routeId: 'r' });
    expect(s.tapeLine()?.points).toEqual([[0.5, 0], [1, 0], [1, 0.5]]);
    expect(s.tapeLine()?.route?.id).toBe('r');
    expect(s.tapeLine()?.metres).toBeCloseTo(111_195, -1);
    // Ends on different routes, or one beside any route, are joined by the great circle.
    s.moveTapeEnd('end', { at: [1, 0.5], routeId: 'q' });
    expect(s.tapeLine()?.points).toEqual(greatCircle([0.5, 0], [1, 0.5]));
    expect(s.tapeLine()).not.toHaveProperty('route');
    s.moveTapeEnd('end', { at: [1, 0.5] });
    expect(s.tapeLine()?.points).toEqual(greatCircle([0.5, 0], [1, 0.5]));
    // A route that is gone leaves the tape straight.
    s.moveTapeEnd('end', { at: [1, 0.5], routeId: 'r' });
    s.removeRoute('r');
    expect(s.tapeLine()?.points).toEqual(greatCircle([0.5, 0], [1, 0.5]));
  });
});
