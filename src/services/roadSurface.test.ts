import { describe, expect, it } from 'vitest';
import type { LngLat } from '../model/route';
import type { OsmObject } from './osm';
import { matchSurfaces, overpassRoadQuery, postpassRoadQuery, surfaceOf } from './roadSurface';

describe('surfaceOf', () => {
  it('groups surfaces, then track types, then takes main and residential roads as paved', () => {
    expect(surfaceOf({ highway: 'track', surface: 'fine_gravel' })).toBe('compacted');
    expect(surfaceOf({ highway: 'path', surface: 'ground' })).toBe('dirt');
    expect(surfaceOf({ highway: 'track', tracktype: 'grade3' })).toBe('gravel');
    expect(surfaceOf({ highway: 'secondary' })).toBe('paved');
    expect(surfaceOf({ highway: 'residential' })).toBe('paved');
    expect(surfaceOf({ highway: 'service' })).toBe('unknown');
    expect(surfaceOf({ highway: 'primary', surface: 'snow' })).toBe('unknown');
  });
});

describe('road queries', () => {
  const lines: LngLat[][] = [
    [
      [7.7, 49.1],
      [7.71, 49.1],
    ],
    [
      [7.72, 49.1],
      [7.73, 49.11],
    ],
  ];

  it('asks Postpass for the roads within reach of all lines at once, with the tags that say what they are made of', () => {
    expect(postpassRoadQuery(lines)).toBe(
      'SELECT DISTINCT ON (road.osm_type, road.osm_id) road.osm_type, road.osm_id, ' +
        "jsonb_strip_nulls(jsonb_build_object('highway', road.tags->'highway', 'surface', road.tags->'surface', 'tracktype', road.tags->'tracktype')) AS tags, road.geom " +
        "FROM (VALUES (ST_GeomFromText('LINESTRING(7.7 49.1,7.71 49.1)', 4326)),(ST_GeomFromText('LINESTRING(7.72 49.1,7.73 49.11)', 4326))) AS course(line) " +
        "JOIN postpass_line AS road ON ST_DWithin(road.geom, course.line, 0.000274) WHERE road.tags ? 'highway'",
    );
  });

  it('asks about a long line in parts of about 5 km', () => {
    // 12 km east in 1.2 km steps.
    const long = Array.from({ length: 11 }, (_, i): LngLat => [7 + (i * 1200) / (111_320 * Math.cos((49 * Math.PI) / 180)), 49]);
    const course = postpassRoadQuery([long]).match(/LINESTRING\(([^)]*)\)/g)!;
    // A part ends once it is 5 km long, the last one taking the rest.
    expect(course.map((part) => part.split(',').length)).toEqual([6, 6]);
  });

  it('asks the Overpass API the same along each line', () => {
    expect(overpassRoadQuery(lines)).toBe(
      '[out:json][timeout:60];(way[highway](around:20,49.1,7.7,49.1,7.71);way[highway](around:20,49.1,7.72,49.11,7.73););out tags geom;',
    );
  });
});

describe('matchSurfaces', () => {
  // Metres east and north of a spot, as longitude and latitude.
  const at = (east: number, north: number): LngLat => [7.7 + east / (111_320 * Math.cos((49.1 * Math.PI) / 180)), 49.1 + north / 111_320];
  const road = (id: number, tags: Record<string, string>, ...points: LngLat[]): OsmObject => ({ type: 'way', id, tags, geometry: { type: 'LineString', coordinates: points } });

  it('takes the nearest road running along each stretch, not one crossing it', () => {
    const line = [at(0, 0), at(25, 0), at(50, 0), at(75, 0)];
    const roads = [
      road(1, { highway: 'track', surface: 'gravel' }, at(-10, 3), at(30, 3)),
      road(2, { highway: 'secondary' }, at(30, 6), at(100, 6)),
      // Crosses the line at 60 m, nearer than the secondary road but at a right angle.
      road(3, { highway: 'path', surface: 'grass' }, at(62.5, -50), at(62.5, 50)),
    ];
    expect(matchSurfaces([line], roads)).toEqual([['gravel', 'paved', 'paved']]);
  });

  it('leaves stretches with no road within reach unknown', () => {
    expect(matchSurfaces([[at(0, 0), at(25, 0)]], [road(1, { highway: 'residential' }, at(0, 40), at(25, 40))])).toEqual([['unknown']]);
    expect(matchSurfaces([], [])).toEqual([]);
  });
});
