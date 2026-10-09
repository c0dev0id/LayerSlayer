import { describe, expect, it } from 'vitest';
import { checkAnswer, geometryOf, overpassQuery, toGeoJson } from './overpass';

describe('overpassQuery', () => {
  const area: [number, number][] = [
    [8.38, 49],
    [8.42, 49.0000001],
    [8.4, 49.02],
  ];

  it('asks for every filter within the polygon, in latitude–longitude order', () => {
    expect(overpassQuery(['amenity=drinking_water', 'power=generator generator:source=wind', 'shop=*'], area)).toBe(
      '[out:json][timeout:90];(' +
        'nwr["amenity"="drinking_water"](poly:"49 8.38 49 8.42 49.02 8.4");' +
        'nwr["power"="generator"]["generator:source"="wind"](poly:"49 8.38 49 8.42 49.02 8.4");' +
        'nwr["shop"](poly:"49 8.38 49 8.42 49.02 8.4");' +
        ');out geom;',
    );
  });

  it('escapes quotes and backslashes in values', () => {
    expect(overpassQuery(['name=a\\b'], area)).toContain('["name"="a\\\\b"]');
  });

  it('finds values containing a text literally, whatever its case', () => {
    expect(overpassQuery(['name~Sonderwaffenlager'], area)).toContain('nwr["name"~"Sonderwaffenlager",i](poly:');
    // The dot is no wildcard: escaped for the regular expression, whose backslash is escaped for the string.
    expect(overpassQuery(['name~St.'], area)).toContain('["name"~"St\\\\.",i]');
  });

  it('searches the texts of one key in one statement', () => {
    const query = overpassQuery(['name~Nike-', 'name~Hawk-', 'name~Pershing military=*'], area);
    expect(query).toContain('nwr["name"~"Nike-|Hawk-",i](poly:');
    expect(query).toContain('nwr["name"~"Pershing",i]["military"](poly:');
  });
});

describe('checkAnswer', () => {
  it('passes OSM data', () => {
    const answer = { elements: [{ type: 'node', id: 1, lat: 49, lon: 8 }] };
    expect(checkAnswer(answer)).toBe(answer);
  });

  it('turns away what is no OSM data', () => {
    expect(() => checkAnswer(null)).toThrow('did not answer with OpenStreetMap data');
    expect(() => checkAnswer({ remark: 'x' })).toThrow('did not answer with OpenStreetMap data');
  });

  it('reports a query that gave up, although it answered', () => {
    const remark = 'runtime error: Query timed out in "query" at line 1 after 91 seconds.';
    expect(() => checkAnswer({ elements: [], remark })).toThrow(`The Overpass API gave up: ${remark} A smaller area`);
  });
});

describe('toGeoJson', () => {
  it('makes points, lines, areas and multipolygons with the tags as properties', async () => {
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 1, lon: 0 },
      { lat: 0, lon: 0 },
    ];
    const geojson = await toGeoJson({
      elements: [
        { type: 'node', id: 1, lat: 49, lon: 8, tags: { amenity: 'drinking_water' } },
        { type: 'way', id: 2, geometry: square.slice(0, 3), tags: { power: 'line' } },
        { type: 'way', id: 3, geometry: square, tags: { leisure: 'park' } },
        {
          type: 'relation',
          id: 4,
          tags: { type: 'multipolygon', natural: 'water' },
          members: [{ type: 'way', ref: 5, role: 'outer', geometry: square }],
        },
      ],
    });
    expect(geojson.features.map((f) => [f.id, f.geometry.type]).sort()).toEqual([
      ['node/1', 'Point'],
      ['relation/4', 'Polygon'],
      ['way/2', 'LineString'],
      ['way/3', 'Polygon'],
    ]);
    expect(geojson.features.find((f) => f.id === 'node/1')?.properties).toMatchObject({ amenity: 'drinking_water' });
  });
});

describe('geometryOf', () => {
  it('gives nodes as points, ways as lines and relations as their members', () => {
    expect(geometryOf({ type: 'node', id: 1, lat: 49, lon: 8 })).toEqual({ type: 'Point', coordinates: [8, 49] });
    expect(geometryOf({ type: 'way', id: 1, geometry: [{ lat: 49, lon: 8 }, { lat: 49.1, lon: 8.1 }] })).toEqual({ type: 'LineString', coordinates: [[8, 49], [8.1, 49.1]] });
    expect(geometryOf({ type: 'relation', id: 1, members: [{ type: 'way', geometry: [{ lat: 49, lon: 8 }, { lat: 49, lon: 8.1 }] }, { type: 'node', lat: 49.05, lon: 8.05 }] })).toEqual({
      type: 'MultiLineString',
      coordinates: [[[8, 49], [8.1, 49]]],
    });
  });

  it('splits clipped lines where points were left out', () => {
    expect(geometryOf({ type: 'way', id: 1, geometry: [{ lat: 49, lon: 8 }, { lat: 49, lon: 8.1 }, null, { lat: 49.1, lon: 8.2 }, { lat: 49.1, lon: 8.3 }] })).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [[8, 49], [8.1, 49]],
        [[8.2, 49.1], [8.3, 49.1]],
      ],
    });
    expect(geometryOf({ type: 'relation', id: 1, members: [{ type: 'way', geometry: [null, { lat: 49, lon: 8 }, { lat: 49, lon: 8.1 }, null] }] })).toEqual({
      type: 'MultiLineString',
      coordinates: [[[8, 49], [8.1, 49]]],
    });
  });
});
