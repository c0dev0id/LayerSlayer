import { describe, expect, it } from 'vitest';
import { checkAnswer, formatFilter, overpassQuery, parseFilter, toGeoJson } from './overpass';

describe('parseFilter', () => {
  it('reads tags with a value or any value', () => {
    expect(parseFilter('amenity=drinking_water')).toEqual([{ key: 'amenity', value: 'drinking_water' }]);
    expect(parseFilter('shop=*')).toEqual([{ key: 'shop' }]);
    expect(parseFilter('  shop ')).toEqual([{ key: 'shop' }]);
  });

  it('reads several tags, which must all match', () => {
    expect(parseFilter('power=generator generator:source=wind')).toEqual([
      { key: 'power', value: 'generator' },
      { key: 'generator:source', value: 'wind' },
    ]);
  });

  it('allows spaces around the equals sign and quotes around spaces', () => {
    expect(parseFilter('amenity = bench')).toEqual([{ key: 'amenity', value: 'bench' }]);
    expect(parseFilter('operator="Deutsche Bahn" "a b"=c')).toEqual([
      { key: 'operator', value: 'Deutsche Bahn' },
      { key: 'a b', value: 'c' },
    ]);
    expect(parseFilter('name="*"')).toEqual([{ key: 'name', value: '*' }]);
    expect(parseFilter('name=""')).toEqual([{ key: 'name', value: '' }]);
  });

  it('says what it cannot read', () => {
    expect(() => parseFilter('')).toThrow('Name at least one tag');
    expect(() => parseFilter('amenity=')).toThrow('“amenity=” is not a tag');
    expect(() => parseFilter('=bench')).toThrow('“=bench” is not a tag');
    expect(() => parseFilter('name="Main Street')).toThrow('is not a tag');
    expect(() => parseFilter('a"b"')).toThrow('is not a tag');
    expect(() => parseFilter('""=x')).toThrow('A tag needs a key.');
  });
});

describe('formatFilter', () => {
  it('writes filters one way, quoting where needed', () => {
    expect(formatFilter(parseFilter('amenity = bench  shop'))).toBe('amenity=bench shop=*');
    expect(formatFilter(parseFilter('operator="Deutsche Bahn" name="*" ref=""'))).toBe('operator="Deutsche Bahn" name="*" ref=""');
  });
});

describe('overpassQuery', () => {
  const area: [number, number][] = [
    [8.38, 49],
    [8.42, 49.0000001],
    [8.4, 49.02],
  ];

  it('asks for every filter within the polygon, in latitude–longitude order', () => {
    expect(overpassQuery(['amenity=drinking_water', 'power=generator generator:source=wind', 'shop=*', 'amenity=drinking_water'], area)).toBe(
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
    expect(() => checkAnswer({ elements: [], remark })).toThrow(`The Overpass API gave up: ${remark} A smaller focus area`);
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
