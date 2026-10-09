import { describe as group, expect, it } from 'vitest';
import { describe, distanceTo, kindsOf, nearestByKind, overpassDetailsQuery, postpassDetailsQuery, searchRadius, words } from './osmDetails';
import { fromOverpass, type OsmElement } from './overpass';

const spot: [number, number] = [8.4, 49.0];
/** A point `east` and `north` metres from the spot. */
const at = (east: number, north: number) => ({ lat: 49 + north / 110_574, lon: 8.4 + east / (111_320 * Math.cos((49 * Math.PI) / 180)) });
const node = (id: number, east: number, north: number, tags: Record<string, string>) => fromOverpass({ type: 'node', id, ...at(east, north), tags });
const way = (id: number, points: [number, number][], tags: Record<string, string>) =>
  fromOverpass({ type: 'way', id, geometry: points.map(([e, n]) => at(e, n)), tags });

group('kindsOf', () => {
  it('takes drivable ways, places to go to and barriers', () => {
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { highway: 'track' }))).toEqual(['road']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { highway: 'primary_link' }))).toEqual(['road']);
    expect(kindsOf(node(1, 0, 0, { amenity: 'fuel' }))).toEqual(['poi']);
    expect(kindsOf(node(1, 0, 0, { shop: 'bakery' }))).toEqual(['poi']);
    expect(kindsOf(node(1, 0, 0, { barrier: 'gate' }))).toEqual(['barrier']);
  });

  it('takes bunkers, historic places, former military sites and Cold War sites known by name as history', () => {
    expect(kindsOf(node(1, 0, 0, { military: 'bunker', bunker_type: 'pillbox' }))).toEqual(['history']);
    expect(kindsOf(node(1, 0, 0, { historic: 'memorial', memorial: 'war_memorial' }))).toEqual(['history']);
    expect(kindsOf(node(1, 0, 0, { historic: 'castle', name: 'Burg Berwartstein', tourism: 'attraction' }))).toEqual(['history']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { 'abandoned:military': 'barracks' }))).toEqual(['history']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { natural: 'heath', name: 'ehmalige NIKE-Abschussstellung Salzwoog' }))).toEqual(['history']);
    expect(kindsOf(node(1, 0, 0, { historic: 'no', amenity: 'cafe' }))).toEqual(['poi']);
  });

  it('takes lakes, bays, rivers and bridges besides what else they are; a road on a bridge is both', () => {
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { natural: 'water', water: 'lake', name: 'Bodensee' }))).toEqual(['water']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { waterway: 'river', name: 'Rhein' }))).toEqual(['water']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { natural: 'bay' }))).toEqual(['water']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { highway: 'trunk', bridge: 'yes' }))).toEqual(['road', 'bridge']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { man_made: 'bridge', name: 'Rheinbrücke Maxau' }))).toEqual(['bridge']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { highway: 'footway', bridge: 'yes' }))).toEqual(['bridge']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { heritage: '4', building: 'church' }))).toEqual(['history']);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { waterway: 'ditch' }))).toEqual([]);
    expect(kindsOf(node(1, 0, 0, { bridge: 'yes' }))).toEqual([]);
  });

  it('leaves out footways, street furniture, kerbs and unnamed boards', () => {
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { highway: 'footway' }))).toEqual([]);
    expect(kindsOf(way(1, [[0, 0], [1, 1]], { landuse: 'farmland' }))).toEqual([]);
    expect(kindsOf(node(1, 0, 0, { amenity: 'bench', backrest: 'yes' }))).toEqual([]);
    expect(kindsOf(node(1, 0, 0, { barrier: 'kerb' }))).toEqual([]);
    expect(kindsOf(node(1, 0, 0, { tourism: 'information', information: 'board' }))).toEqual([]);
    expect(kindsOf(node(1, 0, 0, { leisure: 'picnic_table' }))).toEqual([]);
    expect(kindsOf(node(1, 0, 0, { leisure: 'park', name: 'Schlossgarten' }))).toEqual(['poi']);
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

  it('measures none to an area the source says the spot lies in, even with no outline left in the box', () => {
    const lake = { type: 'relation' as const, id: 1, tags: { natural: 'water' }, geometry: { type: 'GeometryCollection' as const, geometries: [] }, within: true };
    expect(distanceTo(lake, spot)).toBe(0);
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

  it('counts an object as each of its kinds', () => {
    const found = nearestByKind([way(1, [[-100, 5], [100, 5]], { highway: 'primary', bridge: 'yes' }), way(2, [[-100, 20], [100, 20]], { highway: 'track' })], spot);
    expect(found.map((f) => [f.kind, f.object.id])).toEqual([
      ['road', 1],
      ['bridge', 1],
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

  it('tells history by what it is, when it was, whether it is listed and what is written on it', () => {
    const details = describe({
      kind: 'history',
      distance: 12,
      object: node(6, 0, 0, {
        military: 'bunker',
        bunker_type: 'munitions',
        start_date: '1961',
        end_date: '1990',
        heritage: '4',
        inscription: 'Area 1',
        wikipedia: 'de:Sondermunitionslager Fischbach',
      }),
    });
    expect(details.title).toBe('Munition bunker');
    expect(details.rows).toEqual([
      { icon: 'date', label: 'Built', value: '1961' },
      { icon: 'date', label: 'Until', value: '1990' },
      { icon: 'heritage', label: 'Heritage', value: 'Listed monument' },
      { icon: 'text', label: 'Inscription', value: 'Area 1' },
      { icon: 'website', label: 'Wikipedia', value: 'Sondermunitionslager Fischbach', href: 'https://de.wikipedia.org/wiki/Sondermunitionslager_Fischbach' },
    ]);
    const title = (tags: Record<string, string>) => describe({ kind: 'history', distance: 0, object: node(7, 0, 0, tags) }).title;
    expect(title({ historic: 'memorial', memorial: 'war_memorial' })).toBe('War memorial');
    expect(title({ historic: 'wayside_cross' })).toBe('Wayside cross');
    expect(title({ 'disused:military': 'barracks' })).toBe('Former barracks');
    expect(title({ name: 'Denkmalzone ehemaliges Sonderwaffenlager Fischbach' })).toBe('Historic site');
    expect(title({ heritage: '4', building: 'church' })).toBe('Listed building');
    expect(title({ heritage: '4', man_made: 'cross' })).toBe('Listed monument');
  });

  it('tells water by what it is, and whether it dries up', () => {
    const water = (tags: Record<string, string>) => describe({ kind: 'water', distance: 0, object: way(8, [[0, 0], [1, 1]], tags) });
    expect(water({ natural: 'water', water: 'lake', name: 'Bodensee', wikipedia: 'de:Bodensee' })).toMatchObject({
      title: 'Lake',
      name: 'Bodensee',
      rows: [{ label: 'Wikipedia', href: 'https://de.wikipedia.org/wiki/Bodensee' }],
    });
    expect(water({ waterway: 'stream', name: 'Fischbach', intermittent: 'yes' }).rows).toEqual([{ icon: 'date', label: 'Seasonal', value: 'Dries up at times' }]);
    expect(water({ natural: 'water', water: 'oxbow' }).title).toBe('Oxbow lake');
    expect(water({ natural: 'water', water: 'fishpond' }).title).toBe('Fishpond');
    expect(water({ natural: 'water' }).title).toBe('Water');
    expect(water({ natural: 'bay', name: 'Kieler Bucht' }).title).toBe('Bay');
  });

  it("tells a bridge by its own name, what it carries and its weight limit, not the road's name", () => {
    const bridge = (tags: Record<string, string>) => describe({ kind: 'bridge', distance: 3, object: way(9, [[0, 0], [1, 1]], tags) });
    expect(bridge({ highway: 'trunk', bridge: 'yes', name: 'B 10', maxweight: '30' })).toMatchObject({
      title: 'Bridge',
      rows: [
        { label: 'Carries', value: 'Trunk road' },
        { label: 'Weight limit', value: '30 t' },
      ],
    });
    expect(bridge({ highway: 'trunk', bridge: 'yes', name: 'B 10' }).name).toBeUndefined();
    expect(bridge({ railway: 'rail', bridge: 'viaduct', 'bridge:name': 'Hochbrücke' })).toMatchObject({ title: 'Viaduct', name: 'Hochbrücke' });
    expect(bridge({ man_made: 'bridge', name: 'Rheinbrücke Maxau', start_date: '1966' })).toMatchObject({
      name: 'Rheinbrücke Maxau',
      rows: [{ label: 'Built', value: '1966' }],
    });
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
    expect(query).toContain('nwr.near["historic"];');
    expect(query).toContain('nwr.near["military"="bunker"];');
    expect(query).toContain('nwr.near["name"~"sonderwaffenlager|munitionslager|');
    expect(query).toContain('node.near["barrier"];');
    expect(query).toContain('nwr.near["natural"~"^(water|bay|strait)$"];nwr.near["waterway"~"^(river|stream|canal)$"];');
    expect(query).toContain('nwr.near["man_made"="bridge"];way.near["bridge"]["bridge"!="no"];');
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
    expect(query).toContain("(tags ?| ARRAY['leisure'] AND tags ? 'name')");
    expect(query).toContain("OR tags ?| ARRAY['historic', 'bunker_type', 'abandoned:military', 'disused:military', 'historic:military', 'heritage']");
    expect(query).toContain(`OR tags @> '{"military":"bunker"}'::jsonb`);
    expect(query).toContain("tags->>'name' ILIKE ANY (ARRAY['%sonderwaffenlager%',");
    expect(query).toContain("(osm_type = 'N' AND tags ? 'barrier')");
    expect(query).toContain("OR tags->>'natural' IN ('water', 'bay', 'strait') OR tags->>'waterway' IN ('river', 'stream', 'canal')");
    expect(query).toContain(`OR tags @> '{"man_made":"bridge"}'::jsonb OR (osm_type = 'W' AND tags ? 'bridge' AND tags->>'bridge' <> 'no')`);
  });

  it('asks Postpass whether the spot lies within each area', () => {
    const query = postpassDetailsQuery(spot, 63.4);
    expect(query).toMatch(/^SELECT DISTINCT ON \(osm_type, osm_id\) osm_type, osm_id, tags, geom, within FROM/);
    expect(query).toContain('ST_Intersects(geom, ST_SetSRID(ST_MakePoint(8.400000, 49.000000), 4326)) AS within');
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
