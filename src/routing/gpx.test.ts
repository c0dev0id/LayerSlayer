import { describe, expect, it } from 'vitest';
import type { LngLat, Route } from '../model/route';
import { gpxToRouteData, gpxTracksGeoJson, MAX_ROUTED_POINTS, MAX_TRACK_POINTS, parseGpx, routeTracks, toGpx } from './gpx';

const time = new Date('2026-10-05T12:00:00Z');

describe('toGpx', () => {
  it('writes one track with a segment per route', () => {
    const gpx = toGpx(
      'Alps',
      [],
      [
        {
          name: 'Day 1',
          points: [
            [11.5, 48.1],
            [11.6, 48.2],
          ],
        },
        { name: 'Day 2', points: [[12, 47]] },
      ],
      time,
    );
    expect(gpx).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="webmap" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Alps</name>
    <time>2026-10-05T12:00:00.000Z</time>
  </metadata>
  <trk>
    <name>Day 1</name>
    <trkseg>
      <trkpt lat="48.100000" lon="11.500000"/>
      <trkpt lat="48.200000" lon="11.600000"/>
    </trkseg>
  </trk>
  <trk>
    <name>Day 2</name>
    <trkseg>
      <trkpt lat="47.000000" lon="12.000000"/>
    </trkseg>
  </trk>
</gpx>
`);
  });

  it('writes waypoints, with a description if there is one, before the tracks', () => {
    const gpx = toGpx(
      'Alps',
      [
        { id: 'a', name: 'Café', lngLat: [11.5, 48.1] },
        { id: 'b', name: 'Gravel', lngLat: [11.6, 48.2], description: 'Loose stones after the bend' },
      ],
      [{ name: 'Day 1', points: [[11.5, 48.1]] }],
      time,
    );
    expect(gpx).toContain(`  </metadata>
  <wpt lat="48.100000" lon="11.500000">
    <name>Café</name>
  </wpt>
  <wpt lat="48.200000" lon="11.600000">
    <name>Gravel</name>
    <desc>Loose stones after the bend</desc>
  </wpt>
  <trk>`);
  });

  it('escapes names and descriptions', () => {
    const gpx = toGpx(
      'A & B',
      [{ id: 'w', name: 'Tom & Jerry', lngLat: [0, 0], description: '<b>' }],
      [{ name: '<Pass> "Höhe"', points: [] }],
      time,
    );
    expect(gpx).toContain('<name>A &amp; B</name>');
    expect(gpx).toContain('<name>Tom &amp; Jerry</name>');
    expect(gpx).toContain('<desc>&lt;b&gt;</desc>');
    expect(gpx).toContain('<name>&lt;Pass&gt; &quot;Höhe&quot;</name>');
  });

  it('keeps longitudes in [-180, 180)', () => {
    const gpx = toGpx(
      'x',
      [{ id: 'w', name: 'w', lngLat: [190, 0] }],
      [
        {
          name: 't',
          points: [
            [180, 0],
            [-190, 0],
            [359, 0],
          ],
        },
      ],
      time,
    );
    expect(gpx).toContain('<wpt lat="0.000000" lon="-170.000000">');
    expect(gpx).toContain('lon="-180.000000"');
    expect(gpx).toContain('lon="170.000000"');
    expect(gpx).toContain('lon="-1.000000"');
  });
});

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

describe('parseGpx', () => {
  it('reads waypoints, routes and tracks with their segments joined', () => {
    const gpx = parseGpx(GPX_11);
    expect(gpx.waypoints).toEqual([
      { lngLat: [11.5, 48.1], name: 'Café', description: 'Good cake' },
      { lngLat: [11.6, 48.2], name: undefined, description: 'No name' },
    ]);
    expect(gpx.routes).toEqual([
      {
        name: 'Planned',
        points: [
          [11.5, 48.1],
          [11.7, 48.3],
        ],
      },
    ]);
    expect(gpx.tracks).toEqual([
      {
        name: undefined,
        points: [
          [12, 47],
          [12.1, 47.1],
          [12.2, 47.2],
        ],
      },
    ]);
  });

  it('reads GPX 1.0 and documents without a namespace', () => {
    const gpx = parseGpx(
      '<gpx version="1.0" xmlns="http://www.topografix.com/GPX/1/0"><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>',
    );
    expect(gpx.tracks[0]!.points).toEqual([[2, 1]]);
    expect(parseGpx('<gpx><wpt lat="1" lon="2"/></gpx>').waypoints).toHaveLength(1);
  });

  it('turns away what is not GPX', () => {
    expect(() => parseGpx('{"type":"FeatureCollection"}')).toThrow('not a GPX file');
    expect(() => parseGpx('<kml/>')).toThrow('not a GPX file');
  });
});

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
  });

  it('names a single unnamed line after the file and drops repeated points', () => {
    const gpx = {
      waypoints: [],
      routes: [],
      tracks: [
        {
          points: [
            [1, 1],
            [1.0000001, 1],
            [2, 2],
          ] as LngLat[],
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

  it('simplifies long tracks and treats long routes as tracks', () => {
    const zigzag = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [i * 0.0001, (i % 2) * 0.0002]);
    const data = gpxToRouteData(
      { waypoints: [], routes: [{ points: zigzag(MAX_ROUTED_POINTS + 1) }], tracks: [{ points: zigzag(3000) }] },
      options,
    );
    expect(data.routes[0]!.points.slice(1).every((p) => p.straight)).toBe(true);
    expect(data.routes[1]!.points.length).toBeLessThanOrEqual(MAX_TRACK_POINTS);
  });
});

describe('gpxTracksGeoJson', () => {
  it('turns each track into a line, several segments into a multi-line, and ignores the rest', () => {
    const geojson = gpxTracksGeoJson(`<gpx xmlns="http://www.topografix.com/GPX/1/1">
      <wpt lat="1" lon="1"/>
      <rte><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte>
      <trk><name>One</name><trkseg><trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg></trk>
      <trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg><trkseg><trkpt lat="5" lon="6"/></trkseg>
        <trkseg><trkpt lat="5" lon="6"/><trkpt lat="7" lon="8"/></trkseg></trk>
      <trk><name>Empty</name><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>
    </gpx>`);
    expect(geojson.features).toEqual([
      {
        type: 'Feature',
        properties: { name: 'One' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [2, 1],
            [4, 3],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { name: null },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [2, 1],
              [4, 3],
            ],
            [
              [6, 5],
              [8, 7],
            ],
          ],
        },
      },
    ]);
  });

  it('turns away what is not GPX', () => {
    expect(() => gpxTracksGeoJson('<kml/>')).toThrow('not a GPX file');
  });
});
