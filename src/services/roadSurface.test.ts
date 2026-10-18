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

  it('asks Postpass for the roads within reach of all lines at once', () => {
    expect(postpassRoadQuery(lines)).toBe(
      "SELECT osm_type, osm_id, tags, geom FROM postpass_line WHERE tags ? 'highway' " +
        "AND ST_DWithin(geom, ST_GeomFromText('MULTILINESTRING((7.7 49.1,7.71 49.1),(7.72 49.1,7.73 49.11))', 4326), 0.000274)",
    );
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
