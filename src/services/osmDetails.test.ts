import { describe as group, expect, it } from 'vitest';
import { describe, distanceTo, kindOf, nearestByKind, overpassDetailsQuery, postpassDetailsQuery, searchRadius, words } from './osmDetails';
import { fromOverpass, type OsmElement } from './overpass';

const spot: [number, number] = [8.4, 49.0];
/** A point `east` and `north` metres from the spot. */
const at = (east: number, north: number) => ({ lat: 49 + north / 110_574, lon: 8.4 + east / (111_320 * Math.cos((49 * Math.PI) / 180)) });
const node = (id: number, east: number, north: number, tags: Record<string, string>) => fromOverpass({ type: 'node', id, ...at(east, north), tags });
const way = (id: number, points: [number, number][], tags: Record<string, string>) =>
  fromOverpass({ type: 'way', id, geometry: points.map(([e, n]) => at(e, n)), tags });

group('kindOf', () => {
  it('takes drivable ways, places to go to and barriers', () => {
    expect(kindOf(way(1, [[0, 0], [1, 1]], { highway: 'track' }))).toBe('road');
    expect(kindOf(way(1, [[0, 0], [1, 1]], { highway: 'primary_link' }))).toBe('road');
    expect(kindOf(node(1, 0, 0, { amenity: 'fuel' }))).toBe('poi');
    expect(kindOf(node(1, 0, 0, { shop: 'bakery' }))).toBe('poi');
    expect(kindOf(node(1, 0, 0, { barrier: 'gate' }))).toBe('barrier');
  });

  it('leaves out footways, street furniture, kerbs and unnamed boards', () => {
    expect(kindOf(way(1, [[0, 0], [1, 1]], { highway: 'footway' }))).toBeUndefined();
    expect(kindOf(way(1, [[0, 0], [1, 1]], { landuse: 'farmland' }))).toBeUndefined();
    expect(kindOf(node(1, 0, 0, { amenity: 'bench', backrest: 'yes' }))).toBeUndefined();
    expect(kindOf(node(1, 0, 0, { barrier: 'kerb' }))).toBeUndefined();
    expect(kindOf(node(1, 0, 0, { tourism: 'information', information: 'board' }))).toBeUndefined();
    expect(kindOf(node(1, 0, 0, { leisure: 'picnic_table' }))).toBeUndefined();
    expect(kindOf(node(1, 0, 0, { leisure: 'park', name: 'Schlossgarten' }))).toBe('poi');
  });
});

group('distanceTo', () => {
  it('measures to a node, to the nearest part of a line, and inside an area as none', () => {
    expect(distanceTo(node(1, 30, 40, {}), spot)).toBeCloseTo(50, 0);
    expect(distanceTo(way(1, [[-100, 20], [100, 20]], {}), spot)).toBeCloseTo(20, 0);
    expect(distanceTo(way(1, [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], {}), spot)).toBe(0);
    expect(distanceTo(fromOverpass({ type: 'relation', id: 1, members: [{ type: 'way', geometry: [at(5, -50), at(5, 50)] }] }), spot)).toBeCloseTo(5, 0);
    expect(distanceTo(fromOverpass({ type: 'way', id: 1 }), spot)).toBeUndefined();
  });

  it('measures to geometry as Postpass gives it: rings, and pieces clipped to a box', () => {
    const lngLat = (east: number, north: number) => [at(east, north).lon, at(east, north).lat];
    const ring = [lngLat(-10, -10), lngLat(10, -10), lngLat(10, 10), lngLat(-10, 10), lngLat(-10, -10)];
    expect(distanceTo({ type: 'way', id: 1, tags: {}, geometry: { type: 'Polygon', coordinates: [ring] } }, spot)).toBe(0);
    const pieces: GeoJSON.Geometry = {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: lngLat(0, 40) },
        { type: 'LineString', coordinates: [lngLat(-50, 25), lngLat(50, 25)] },
      ],
    };
    expect(distanceTo({ type: 'relation', id: 1, tags: {}, geometry: pieces }, spot)).toBeCloseTo(25, 0);
  });

  it('measures a clipped area to the edge left in the box, as it is no ring any more', () => {
    const ring = [at(-300, -10), at(-10, -10), at(-10, 10), at(-300, 10), at(-300, -10)];
    const clipped: OsmElement = { type: 'relation', id: 1, members: [{ type: 'way', geometry: [null, ring[1]!, ring[2]!, null, null] }] };
    expect(distanceTo(fromOverpass(clipped), spot)).toBeCloseTo(10, 0);
    expect(distanceTo(fromOverpass({ type: 'relation', id: 1, members: [{ type: 'way', geometry: [null, null] }] }), spot)).toBeUndefined();
  });
});

group('nearestByKind', () => {
  it('keeps the nearest of each kind, nearest first', () => {
    const found = nearestByKind(
      [
        way(1, [[-100, 30], [100, 30]], { highway: 'residential' }),
        way(2, [[-100, 12], [100, 12]], { highway: 'track' }),
        node(3, 3, 4, { amenity: 'bench' }),
        node(4, 60, 0, { amenity: 'cafe' }),
        node(5, 0, 8, { barrier: 'gate' }),
      ],
      spot,
    );
    expect(found.map((f) => [f.kind, f.object.id])).toEqual([
      ['barrier', 5],
      ['road', 2],
      ['poi', 4],
    ]);
  });
});

group('describe', () => {
  it('tells a road or trail by type, name, speed, direction, surface and access', () => {
    const details = describe({
      kind: 'road',
      distance: 12,
      object: way(7, [[0, 0], [1, 1]], { highway: 'track', name: 'Waldweg', tracktype: 'grade3', surface: 'fine_gravel', maxspeed: '30', oneway: 'no', motor_vehicle: 'forestry', '4wd_only': 'yes' }),
    });
    expect(details).toMatchObject({ kind: 'road', title: 'Track', name: 'Waldweg', url: 'https://www.openstreetmap.org/way/7' });
    expect(details.rows.map((r) => [r.label, r.value])).toEqual([
      ['Speed limit', '30 km/h'],
      ['Direction', 'Both ways'],
      ['Surface', 'Fine gravel'],
      ['Track', 'Grade 3: mixed hard and soft'],
      ['Motor vehicles', 'Forestry only'],
      ['Four-wheel drive', 'Required'],
    ]);
    expect(describe({ kind: 'road', distance: 0, object: way(8, [], { highway: 'secondary_link', junction: 'roundabout' }) })).toMatchObject({
      title: 'Secondary slip road',
      rows: [{ label: 'Direction', value: 'One way' }],
    });
    expect(describe({ kind: 'road', distance: 0, object: way(9, [], { highway: 'service', service: 'driveway' }) }).title).toBe('Driveway');
  });

  it('tells a place by type, name, address, phone, website and opening hours', () => {
    const details = describe({
      kind: 'poi',
      distance: 40,
      object: node(3, 0, 0, {
        amenity: 'fuel',
        brand: 'Aral',
        'addr:street': 'Hauptstraße',
        'addr:housenumber': '5',
        'addr:postcode': '76131',
        'addr:city': 'Karlsruhe',
        phone: '+49 721 123456',
        website: 'https://www.aral.de/',
        opening_hours: 'Mo-Fr 06:00-22:00; Sa,Su 08:00-20:00',
      }),
    });
    expect(details).toMatchObject({ title: 'Fuel station', name: 'Aral', url: 'https://www.openstreetmap.org/node/3' });
    expect(details.rows).toEqual([
      { icon: 'address', label: 'Address', value: 'Hauptstraße 5, 76131 Karlsruhe' },
      { icon: 'phone', label: 'Phone', value: '+49 721 123456', href: 'tel:+49721123456' },
      { icon: 'website', label: 'Website', value: 'aral.de', href: 'https://www.aral.de/' },
      { icon: 'hours', label: 'Opening hours', value: 'Mo-Fr 06:00-22:00\nSa,Su 08:00-20:00' },
    ]);
  });

  it('tells a barrier by type, opening hours, lock and access', () => {
    const details = describe({ kind: 'barrier', distance: 5, object: node(5, 0, 0, { barrier: 'lift_gate', locked: 'yes', access: 'private' }) });
    expect(details.title).toBe('Lift gate');
    expect(details.rows.map((r) => [r.label, r.value])).toEqual([
      ['Locked', 'Yes'],
      ['Access', 'Private'],
    ]);
  });
});

group('the query', () => {
  it('looks around the spot once and picks drivable ways, places and barriers from there', () => {
    const query = overpassDetailsQuery(spot, 63.4);
    expect(query).toMatch(/^\[out:json\]\[timeout:10\];nwr\(around:63,49\.000000,8\.400000\)->\.near;\(.*\)->\.found;/);
    expect(query.match(/around/g)).toHaveLength(1);
    expect(query).toContain('way.near["highway"~"^((motorway|trunk|primary|secondary|tertiary)(_link)?|');
    expect(query).toContain('nwr.near["amenity"];');
    expect(query).toContain('nwr.near["leisure"]["name"];');
    expect(query).toContain('node.near["barrier"];');
  });

  it('clips relations to a box twice the radius around the spot', () => {
    expect(overpassDetailsQuery(spot, 63.4)).toMatch(
      /\(node\.found;way\.found;\);out tags geom;relation\.found;out geom\(48\.998853,8\.398264,49\.001147,8\.401736\);$/,
    );
  });

  it('asks Postpass the same: drivable ways, places and barrier nodes within the radius', () => {
    const query = postpassDetailsQuery(spot, 63.4);
    expect(query).toContain('ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(8.400000, 49.000000), 4326)::geography, 63)');
    expect(query).toContain("(osm_type = 'W' AND tags->>'highway' ~ '^((motorway|trunk|primary|secondary|tertiary)(_link)?|");
    expect(query).toContain("tags ?| ARRAY['amenity', 'shop', 'tourism', 'craft', 'office', 'healthcare']");
    expect(query).toContain("(tags ?| ARRAY['leisure', 'historic'] AND tags ? 'name')");
    expect(query).toContain("(osm_type = 'N' AND tags ? 'barrier')");
  });

  it('gives Postpass areas as outlines, those of relations clipped to the same box', () => {
    const query = postpassDetailsQuery(spot, 63.4);
    const box = 'ST_MakeEnvelope(8.398264, 48.998853, 8.401736, 49.001147, 4326)';
    expect(query).toContain(`CASE WHEN osm_type = 'R' THEN ST_Intersection(CASE WHEN GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON') THEN ST_Boundary(geom) ELSE geom END, ${box})`);
    // Rows are found by the box of the radius, half as wide.
    expect(query).toContain('WHERE geom && ST_MakeEnvelope(8.399132, 48.999427, 8.400868, 49.000573, 4326) AND ST_DWithin');
  });

  it('looks about 40 pixels around, between 15 and 250 metres', () => {
    expect(searchRadius(49, 15)).toBeCloseTo(63, 0);
    expect(searchRadius(49, 20)).toBe(15);
    expect(searchRadius(49, 10)).toBe(250);
  });

  it('puts tag values in words', () => {
    expect(words('lift_gate')).toBe('Lift gate');
  });
});
