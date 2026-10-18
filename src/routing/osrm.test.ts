import { describe, expect, it, vi } from 'vitest';
import { fetchLeg, parseRouteResponse, routeUrl } from './osrm';

describe('routeUrl', () => {
  it('selects the profile by path and asks for the full polyline6 geometry', () => {
    expect(routeUrl('https://routing.example', 'foot', [11.5, 48.1], [11.6, 48.2])).toBe(
      'https://routing.example/routed-foot/route/v1/driving/11.5,48.1;11.6,48.2?overview=full&geometries=polyline6',
    );
  });
});

describe('parseRouteResponse', () => {
  it('returns the geometry of the first route', () => {
    expect(parseRouteResponse({ code: 'Ok', routes: [{ geometry: 'abc' }] })).toBe('abc');
  });

  it("throws the server's message for routing errors", () => {
    expect(() => parseRouteResponse({ code: 'NoRoute', message: 'Impossible route between points' })).toThrow(
      'Impossible route between points',
    );
    expect(() => parseRouteResponse({ code: 'NoSegment' })).toThrow('Routing failed (NoSegment).');
  });

  it('rejects unexpected answers', () => {
    expect(() => parseRouteResponse('nope')).toThrow(/Unexpected/);
  });
});

describe('fetchLeg', () => {
  it('requests the leg and returns its geometry', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ geometry: 'xyz' }] })));
    const geometry = await fetchLeg({ profile: 'car', from: [1, 2], to: [3, 4] }, fetchFn);
    expect(geometry).toBe('xyz');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://routing.openstreetmap.de/routed-car/route/v1/driving/1,2;3,4?overview=full&geometries=polyline6',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('reports non-JSON answers with their status', async () => {
    const fetchFn = async () => new Response('Bad Gateway', { status: 502 });
    await expect(fetchLeg({ profile: 'car', from: [1, 2], to: [3, 4] }, fetchFn)).rejects.toThrow('status 502');
  });
});
