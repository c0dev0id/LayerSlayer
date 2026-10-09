import { describe, expect, it } from 'vitest';
import { asFeatures, postpassQuery, readPostpass } from './postpass';

const area: [number, number][] = [
  [8.38, 49],
  [8.42, 49.0000001],
  [8.4, 49.02],
];

describe('postpassQuery', () => {
  it('asks for features matching each filter within the polygon, keeping one row per OSM object', () => {
    const within = "ST_Intersects(geom, ST_GeomFromText('POLYGON((8.38 49,8.42 49,8.4 49.02,8.38 49))', 4326))";
    const rows = (where: string) => `SELECT osm_type, osm_id, tags, geom AS geom, area_m2 FROM postpass_pointlinepolygon WHERE ${within} AND ${where}`;
    expect(postpassQuery(['amenity=drinking_water', 'power=generator generator:source=wind', 'shop=*'], area)).toBe(
      'SELECT DISTINCT ON (osm_type, osm_id) osm_type, osm_id, tags, geom FROM (' +
        [
          rows(`(tags @> '{"amenity":"drinking_water"}'::jsonb)`),
          rows(`(tags @> '{"power":"generator"}'::jsonb AND tags @> '{"generator:source":"wind"}'::jsonb)`),
          rows("(tags ? 'shop')"),
        ].join(' UNION ALL ') +
        ') AS found ORDER BY osm_type, osm_id, area_m2 IS NULL',
    );
  });

  it('finds values containing a text literally, whatever its case', () => {
    expect(postpassQuery(['name~Sonderwaffenlager'], area)).toContain("(tags->>'name' ILIKE ANY (ARRAY['%Sonderwaffenlager%']))");
    expect(postpassQuery([`name~"it's 100%_x"`], area)).toContain("(tags->>'name' ILIKE ANY (ARRAY['%it''s 100\\%\\_x%']))");
    expect(postpassQuery(['name~Pershing military=*'], area)).toContain("(tags->>'name' ILIKE '%Pershing%' AND tags ? 'military')");
  });

  it('searches the texts of one key with one query, reading the objects once', () => {
    const query = postpassQuery(['name~Nike-', 'military=bunker', 'name~Hawk-'], area);
    expect(query).toContain("(tags->>'name' ILIKE ANY (ARRAY['%Nike-%', '%Hawk-%']))");
    expect(query.match(/UNION ALL/g)).toHaveLength(1);
  });

  it('quotes keys and values for SQL and JSON', () => {
    // A backslash is escaped for JSON, an apostrophe for SQL.
    const query = postpassQuery(["name=O'Brien\\Pub", `"it's"=*`], area);
    expect(query).toContain(`(tags @> '{"name":"O''Brien\\\\Pub"}'::jsonb)`);
    expect(query).toContain("(tags ? 'it''s')");
  });
});

describe('readPostpass and asFeatures', () => {
  const answer = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [8, 49] }, properties: { osm_type: 'N', osm_id: 1, tags: { military: 'bunker' } } },
      {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [[[[8, 49], [8.1, 49], [8.1, 49.1], [8, 49]]]] },
        properties: { osm_type: 'R', osm_id: 2, tags: { historic: 'monument', name: 'Denkmalzone' } },
      },
      {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: [[[8, 49], [8.1, 49]], [[8.2, 49], [8.3, 49]]] },
        properties: { osm_type: 'W', osm_id: 3, tags: null },
      },
    ],
  };

  it('reads OSM objects, one-part multi-geometries as their part', () => {
    expect(readPostpass(answer).map((o) => [o.type, o.id, o.geometry.type, o.tags])).toEqual([
      ['node', 1, 'Point', { military: 'bunker' }],
      ['relation', 2, 'Polygon', { historic: 'monument', name: 'Denkmalzone' }],
      ['way', 3, 'MultiLineString', {}],
    ]);
  });

  it('identifies features as osmtogeojson does, with the tags as properties', () => {
    const { features } = asFeatures(readPostpass(answer));
    expect(features.map((f) => [f.id, f.geometry.type, f.properties])).toEqual([
      ['node/1', 'Point', { military: 'bunker', id: 'node/1' }],
      ['relation/2', 'Polygon', { historic: 'monument', name: 'Denkmalzone', id: 'relation/2' }],
      ['way/3', 'MultiLineString', { id: 'way/3' }],
    ]);
    expect(features[1]!.geometry).toEqual({ type: 'Polygon', coordinates: [[[8, 49], [8.1, 49], [8.1, 49.1], [8, 49]]] });
  });

  it('reads whether the spot asked about lies within an object, where the query asks', () => {
    const lake = { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [] }, properties: { osm_type: 'R', osm_id: 4, tags: {}, within: true } };
    const shore = { ...lake, properties: { ...lake.properties, osm_id: 5, within: false } };
    expect(readPostpass({ type: 'FeatureCollection', features: [lake, shore] }).map((o) => o.within)).toEqual([true, undefined]);
  });

  it('turns away what is no feature collection', () => {
    expect(() => readPostpass({ error: 'x' })).toThrow('Postpass did not answer with OpenStreetMap data.');
    expect(() => readPostpass(null)).toThrow('Postpass did not answer');
  });
});
