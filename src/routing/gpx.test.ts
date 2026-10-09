import { describe, expect, it } from 'vitest';
import type { LngLat, Route } from '../model/route';
import { parseGpx } from '../services/gpx';
import GARMIN_ROUTE from '../services/fixtures/gpx-garmin-route.gpx?raw';
import { gpxToRouteData, MAX_TRACK_POINTS, routeTracks } from './gpx';

const decode = (geometry: string): LngLat[] => JSON.parse(geometry);

const route: Route = {
  id: 'r',
  name: 'Tour',
  profile: 'car',
  color: '#000',
  points: [
    { id: 'a', lngLat: [1, 1] },
    { id: 'b', lngLat: [2, 2] },
    { id: 'c', lngLat: [3, 3] },
  ],
  legs: { 'car/1,1;2,2': '[[1,1],[1.5,1.2],[2,2]]', 'car/2,2;3,3': '[[2,2],[2.5,2.8],[3,3]]' },
};

describe('routeTracks', () => {
  it('skips routes with fewer than two points', () => {
    const single = { ...route, id: 's', name: 'Single', points: [route.points[0]!], legs: {} };
    expect(routeTracks([route, single], decode).map((t) => t.name)).toEqual(['Tour']);
  });
});

const GPX_11 = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="48.1" lon="11.5"><name>Café</name><desc>Good cake</desc></wpt>
  <wpt lat="48.2" lon="11.6"><cmt>No name</cmt></wpt>
  <wpt lat="95" lon="11.6"><name>Broken</name></wpt>
  <rte><name>Planned</name><rtept lat="48.1" lon="11.5"/><rtept lat="48.3" lon="11.7"/></rte>
  <trk>
    <trkseg><trkpt lat="47.0" lon="12.0"/><trkpt lat="47.1" lon="12.1"/></trkseg>
    <trkseg><trkpt lat="47.2" lon="12.2"/></trkseg>
  </trk>
</gpx>`;

describe('gpxToRouteData', () => {
  let n = 0;
  const options = { fileName: 'tour', profile: 'bike' as const, existing: [], newId: () => `id${n++}` };

  it('routes GPX routes and joins track points by straight lines', () => {
    const data = gpxToRouteData(parseGpx(GPX_11), options);
    expect(data.routes.map((r) => [r.name, r.profile, r.points.map((p) => p.straight === true)])).toEqual([
      ['Planned', 'bike', [false, false]],
      ['tour 2', 'bike', [false, true, true]],
    ]);
    expect(data.routes[0]!.color).not.toBe(data.routes[1]!.color);
    expect(data.waypoints.map((w) => [w.name, w.description])).toEqual([
      ['Café', 'Good cake'],
      ['Waypoint 2', 'No name'],
    ]);
    expect(data.waypoints.every((w) => w.routeId === data.routes[0]!.id)).toBe(true);
  });

  it("takes a route with Garmin's calculated course as a track, routing none of it", () => {
    const [garmin, plain] = gpxToRouteData(parseGpx(GARMIN_ROUTE), options).routes;
    expect(garmin!.name).toBe('Pass road');
    expect(garmin!.points.map((p) => [p.lngLat, p.straight === true])).toEqual([
      [[11, 48], false],
      [[11.1, 48.1], true],
      [[11.1, 48.2], true],
      [[11.2, 48.3], true],
    ]);
    expect(plain!.points.map((p) => p.straight === true)).toEqual([false, false]);
  });

  it('puts waypoints without a route or track into a route of their own, named after the file', () => {
    const data = gpxToRouteData({ waypoints: [{ lngLat: [11.5, 48.1], name: 'Hut' }], routes: [], tracks: [] }, options);
    expect(data.routes.map((r) => [r.name, r.points.length])).toEqual([['tour', 0]]);
    expect(data.waypoints.map((w) => [w.name, w.routeId])).toEqual([['Hut', data.routes[0]!.id]]);
    expect(gpxToRouteData({ waypoints: [], routes: [], tracks: [] }, options)).toEqual({ routes: [], waypoints: [] });
  });

  it('names a single unnamed line after the file and drops repeated points', () => {
    const gpx = {
      waypoints: [],
      routes: [],
      tracks: [
        {
          segments: [
            [
              [1, 1],
              [1.0000001, 1],
            ],
            [[2, 2]],
          ] as LngLat[][],
        },
      ],
    };
    const [route] = gpxToRouteData(gpx, options).routes;
    expect(route!.name).toBe('tour');
    expect(route!.points.map((p) => p.lngLat)).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('routes every point of a long route and simplifies long tracks', () => {
    const zigzag = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [i * 0.0001, (i % 2) * 0.0002]);
    const data = gpxToRouteData({ waypoints: [], routes: [{ points: zigzag(1000) }], tracks: [{ segments: [zigzag(3000)] }] }, options);
    expect(data.routes[0]!.points).toHaveLength(1000);
    expect(data.routes[0]!.points.some((p) => p.straight)).toBe(false);
    expect(data.routes[1]!.points.length).toBeLessThanOrEqual(MAX_TRACK_POINTS);
    expect(data.routes[1]!.points.slice(1).every((p) => p.straight)).toBe(true);
  });
});
