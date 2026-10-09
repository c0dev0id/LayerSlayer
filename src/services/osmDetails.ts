import type { LngLat } from '../model/route';
import { postpassOrOverpass, type OsmObject } from './osm';
import { askOverpass, fromOverpass } from './overpass';
import { askPostpass, selectObjects, sql } from './postpass';

/**
 * What lies at a spot on the map, for people on the move: the nearest road or trail, the
 * nearest place to go to (a POI) and the nearest barrier, each described in words rather
 * than OpenStreetMap tags. Street furniture, fields and the like are left out.
 */

export type DetailKind = 'road' | 'poi' | 'barrier';

/** Ways a motor vehicle can move on, from motorways down to tracks, paths and bridleways. */
const ROAD_VALUES = '^((motorway|trunk|primary|secondary|tertiary)(_link)?|unclassified|residential|living_street|service|track|road|path|bridleway|busway)$';
const ROAD = new RegExp(ROAD_VALUES);

/** Keys of places to go to; leisure and historic places count where they have a name. */
const POI_KEYS = ['amenity', 'shop', 'tourism', 'craft', 'office', 'healthcare'];
const NAMED_POI_KEYS = ['leisure', 'historic'];

/** Amenities that are street furniture rather than places to go to. */
const FURNITURE = new Set([
  'bench',
  'waste_basket',
  'waste_disposal',
  'recycling',
  'grit_bin',
  'clock',
  'parking_space',
  'parking_entrance',
  'hunting_stand',
  'lounger',
  'feeding_place',
  'vending_machine',
  'post_box',
  'letter_box',
  'bicycle_parking',
  'smoking_area',
  'photo_booth',
  'loading_dock',
  'telephone',
]);

/** What an object is to someone on the move, if anything. */
export function kindOf({ type, tags }: OsmObject): DetailKind | undefined {
  if (type === 'node' && tags.barrier && tags.barrier !== 'kerb') return 'barrier';
  if (type === 'way' && ROAD.test(tags.highway ?? '')) return 'road';
  if (poiKey(tags)) return 'poi';
  return undefined;
}

/** The tag that makes the element a place to go to. */
function poiKey(tags: Record<string, string>): string | undefined {
  return (
    POI_KEYS.find((key) => {
      const value = tags[key];
      if (!value) return false;
      if (key === 'amenity') return !FURNITURE.has(value);
      // Signposts and boards are information too, but no place to go to.
      if (key === 'tourism' && value === 'information') return !!tags.name || tags.information === 'office';
      return true;
    }) ?? (tags.name ? NAMED_POI_KEYS.find((key) => tags[key]) : undefined)
  );
}

/**
 * The Overpass query for what may be of interest within `radius` metres of the spot, with
 * geometry. Everything around the spot is looked up once and filtered from there, far less
 * work for the server than a lookup per tag; openstreetmap.org builds its "Query features"
 * query the same way. Relations come clipped to a box twice the radius around the spot: a
 * large park would otherwise bring all of its outline.
 */
export function overpassDetailsQuery([lng, lat]: LngLat, radius: number): string {
  const around = `(around:${Math.round(radius)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const filters = [
    `way.near["highway"~"${ROAD_VALUES}"];`,
    ...POI_KEYS.map((key) => `nwr.near["${key}"];`),
    ...NAMED_POI_KEYS.map((key) => `nwr.near["${key}"]["name"];`),
    `node.near["barrier"];`,
  ];
  const [west, south, east, north] = boxAround([lng, lat], 2 * radius);
  const box = [south, west, north, east].map((v) => v.toFixed(6)).join(',');
  return (
    `[out:json][timeout:10];nwr${around}->.near;(${filters.join('')})->.found;` +
    `(node.found;way.found;);out tags geom;relation.found;out geom(${box});`
  );
}

/** A box `size` metres out from the spot on each side, as west, south, east and north. */
function boxAround([lng, lat]: LngLat, size: number): [number, number, number, number] {
  const [east, north] = metresPerDegree(lat);
  const [dLng, dLat] = [size / east, size / north];
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/**
 * The same as SQL for Postpass: drivable ways, places to go to and barrier nodes within
 * `radius` metres of the spot. Areas come as their outlines, which is what the details
 * measure to and draw, and those of relations clipped to the box twice the radius, as from
 * Overpass. A boundary relation is a line and a polygon there; one row of it is kept.
 */
export function postpassDetailsQuery([lng, lat]: LngLat, radius: number): string {
  const spot = `ST_SetSRID(ST_MakePoint(${lng.toFixed(6)}, ${lat.toFixed(6)}), 4326)`;
  const envelope = (size: number) => `ST_MakeEnvelope(${boxAround([lng, lat], size).map((v) => v.toFixed(6)).join(', ')}, 4326)`;
  const keys = (list: readonly string[]) => `ARRAY[${list.map(sql).join(', ')}]`;
  const outline = "CASE WHEN GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON') THEN ST_Boundary(geom) ELSE geom END";
  // Anything within the radius meets the box of the radius, which the geometry index finds.
  const near = `geom && ${envelope(radius)} AND ST_DWithin(geom::geography, ${spot}::geography, ${Math.round(radius)})`;
  return selectObjects(`CASE WHEN osm_type = 'R' THEN ST_Intersection(${outline}, ${envelope(2 * radius)}) ELSE ${outline} END`, [
    `${near} AND ((osm_type = 'W' AND tags->>'highway' ~ ${sql(ROAD_VALUES)}) OR tags ?| ${keys(POI_KEYS)} ` +
      `OR (tags ?| ${keys(NAMED_POI_KEYS)} AND tags ? 'name') OR (osm_type = 'N' AND tags ? 'barrier'))`,
  ]);
}

/** How far around a spot to look: 40 CSS pixels at the map's zoom, between 15 and 250 metres. */
export function searchRadius(lat: number, zoom: number): number {
  const metresPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  return Math.min(250, Math.max(15, 40 * metresPerPixel));
}

type Point = [number, number];

/** Metres per degree of longitude and of latitude at a latitude. */
function metresPerDegree(lat: number): Point {
  return [111_320 * Math.cos((lat * Math.PI) / 180), 110_574];
}

/** Positions as metres east and north of the spot; plane enough within a few hundred metres. */
function plane([lng, lat]: LngLat): (p: GeoJSON.Position) => Point {
  const [east, north] = metresPerDegree(lat);
  return ([x, y]) => [(x! - lng) * east, (y! - lat) * north];
}

function segmentDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inside([px, py]: Point, ring: Point[]): boolean {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) within = !within;
  }
  return within;
}

/** Distance from the spot to a line of points, none where the spot lies within it as a closed ring. */
function lineDistance(points: Point[]): number {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return Infinity;
  if (points.length >= 4 && first[0] === last[0] && first[1] === last[1] && inside([0, 0], points)) return 0;
  if (points.length === 1) return Math.hypot(first[0], first[1]);
  let nearest = Infinity;
  for (let i = 1; i < points.length; i++) nearest = Math.min(nearest, segmentDistance([0, 0], points[i - 1]!, points[i]!));
  return nearest;
}

/** A geometry's points as runs: a point alone, a line, a ring. */
function runsOf(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  switch (geometry.type) {
    case 'Point':
      return [[geometry.coordinates]];
    case 'MultiPoint':
      return geometry.coordinates.map((p) => [p]);
    case 'LineString':
      return [geometry.coordinates];
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates;
    case 'MultiPolygon':
      return geometry.coordinates.flat();
    case 'GeometryCollection':
      return geometry.geometries.flatMap(runsOf);
  }
}

/**
 * Metres from the spot to the object: to a point, to the nearest part of a line, none
 * within a closed ring. An area clipped to a box is no ring any more, so it is measured to
 * its edge.
 */
export function distanceTo({ geometry }: OsmObject, spot: LngLat): number | undefined {
  const toPlane = plane(spot);
  const nearest = Math.min(...runsOf(geometry).map((run) => lineDistance(run.map(toPlane))));
  return Number.isFinite(nearest) ? nearest : undefined;
}

/** An object near the spot, what it is to someone on the move and how far it is. */
interface Nearby {
  kind: DetailKind;
  object: OsmObject;
  distance: number;
}

/** The nearest object of each kind, nearest first. */
export function nearestByKind(objects: readonly OsmObject[], spot: LngLat): Nearby[] {
  const nearest = new Map<DetailKind, Nearby>();
  for (const object of objects) {
    const kind = kindOf(object);
    const distance = kind && distanceTo(object, spot);
    if (!kind || distance === undefined) continue;
    const known = nearest.get(kind);
    if (!known || distance < known.distance) nearest.set(kind, { kind, object, distance });
  }
  return [...nearest.values()].sort((a, b) => a.distance - b.distance);
}

/** What a line of the description shows, which picks its icon. */
export type RowIcon =
  | 'ref'
  | 'speed'
  | 'oneway'
  | 'bothways'
  | 'surface'
  | 'grade'
  | 'smoothness'
  | 'width'
  | 'access'
  | 'locked'
  | 'address'
  | 'phone'
  | 'website'
  | 'hours';

export interface DetailRow {
  icon: RowIcon;
  label: string;
  value: string;
  /** Where the value leads: a phone number to call, a website to open. */
  href?: string;
}

/** An element described in words. */
export interface Details {
  kind: DetailKind;
  title: string;
  name?: string;
  /** Metres from the spot. */
  distance: number;
  rows: DetailRow[];
  /** The element on openstreetmap.org, with all its tags. */
  url: string;
  tags: Record<string, string>;
  /** Where it lies, for the map to show: a node as a point, a way as a line, a relation as its members' lines. */
  geometry: GeoJSON.Geometry;
}

/** A tag value in words: `lift_gate` becomes "Lift gate". */
export function words(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ROAD_TITLES: Record<string, string> = {
  motorway: 'Motorway',
  trunk: 'Trunk road',
  primary: 'Primary road',
  secondary: 'Secondary road',
  tertiary: 'Tertiary road',
  unclassified: 'Minor road',
  residential: 'Residential road',
  living_street: 'Living street',
  service: 'Service road',
};

const SERVICE_TITLES: Record<string, string> = { driveway: 'Driveway', parking_aisle: 'Parking aisle', alley: 'Alley' };

/** Titles that the tag value in words does not give well. */
const POI_TITLES: Record<string, string> = {
  'amenity=fuel': 'Fuel station',
  'amenity=atm': 'ATM',
  'amenity=bbq': 'Barbecue',
  'amenity=cafe': 'Café',
  'amenity=doctors': 'Doctor',
  'shop=yes': 'Shop',
  'shop=convenience': 'Convenience store',
  'tourism=information': 'Tourist information',
};

const TRACK_GRADES: Record<string, string> = {
  grade1: 'Grade 1: solid, usually paved',
  grade2: 'Grade 2: solid, gravel or compacted',
  grade3: 'Grade 3: mixed hard and soft',
  grade4: 'Grade 4: mostly soft',
  grade5: 'Grade 5: soft, soil, sand or grass',
};

const ACCESS_LABELS: [string, string][] = [
  ['access', 'Access'],
  ['vehicle', 'Vehicles'],
  ['motor_vehicle', 'Motor vehicles'],
  ['motorcar', 'Cars'],
  ['motorcycle', 'Motorcycles'],
];

const ACCESS_VALUES: Record<string, string> = {
  yes: 'Allowed',
  no: 'Not allowed',
  private: 'Private',
  permissive: 'Allowed by the owner',
  destination: 'Destination only',
  designated: 'Designated',
  agricultural: 'Agricultural only',
  forestry: 'Forestry only',
  delivery: 'Delivery only',
  customers: 'Customers only',
  permit: 'With permit',
  discouraged: 'Discouraged',
};

function titleOf(kind: DetailKind, tags: Record<string, string>): string {
  if (kind === 'barrier') return words(tags.barrier!);
  if (kind === 'road') {
    const highway = tags.highway!;
    const link = /^(\w+)_link$/.exec(highway);
    if (link) return `${ROAD_TITLES[link[1]!]!.replace(/ road$/, '')} slip road`;
    if (highway === 'service' && tags.service && SERVICE_TITLES[tags.service]) return SERVICE_TITLES[tags.service]!;
    return ROAD_TITLES[highway] ?? words(highway);
  }
  const key = poiKey(tags)!;
  return POI_TITLES[`${key}=${tags[key]}`] ?? words(tags[key]!);
}

function speedText(value: string): string {
  if (/^\d+(\.\d+)?$/.test(value)) return `${value} km/h`;
  if (value === 'none') return 'No limit';
  if (value === 'walk') return 'Walking pace';
  return value;
}

function accessRows(tags: Record<string, string>): DetailRow[] {
  const rows = ACCESS_LABELS.filter(([key]) => tags[key]).map(([key, label]): DetailRow => ({ icon: 'access', label, value: ACCESS_VALUES[tags[key]!] ?? words(tags[key]!) }));
  if (tags['4wd_only'] === 'yes') rows.push({ icon: 'access', label: 'Four-wheel drive', value: 'Required' });
  return rows;
}

function roadRows(tags: Record<string, string>): DetailRow[] {
  const rows: DetailRow[] = [];
  if (tags.ref) rows.push({ icon: 'ref', label: 'Number', value: tags.ref });
  if (tags.maxspeed) rows.push({ icon: 'speed', label: 'Speed limit', value: speedText(tags.maxspeed) });
  const oneway = tags.oneway ?? (tags.junction === 'roundabout' ? 'yes' : undefined);
  if (oneway === 'no') rows.push({ icon: 'bothways', label: 'Direction', value: 'Both ways' });
  else if (oneway && oneway !== 'no') rows.push({ icon: 'oneway', label: 'Direction', value: 'One way' });
  if (tags.surface) rows.push({ icon: 'surface', label: 'Surface', value: words(tags.surface) });
  if (tags.tracktype) rows.push({ icon: 'grade', label: 'Track', value: TRACK_GRADES[tags.tracktype] ?? words(tags.tracktype) });
  if (tags.smoothness) rows.push({ icon: 'smoothness', label: 'Smoothness', value: words(tags.smoothness) });
  if (tags.width) rows.push({ icon: 'width', label: 'Width', value: /^\d+(\.\d+)?$/.test(tags.width) ? `${tags.width} m` : tags.width });
  return [...rows, ...accessRows(tags)];
}

function hoursRow(tags: Record<string, string>): DetailRow[] {
  return tags.opening_hours ? [{ icon: 'hours', label: 'Opening hours', value: tags.opening_hours.split(/\s*;\s*/).join('\n') }] : [];
}

function poiRows(tags: Record<string, string>): DetailRow[] {
  const rows: DetailRow[] = [];
  const street = [tags['addr:street'] ?? tags['addr:place'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const town = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  const address = [street, town].filter(Boolean).join(', ');
  if (address) rows.push({ icon: 'address', label: 'Address', value: address });
  const phone = tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'];
  if (phone) rows.push({ icon: 'phone', label: 'Phone', value: phone, href: `tel:${phone.split(';')[0]!.replace(/[^\d+]/g, '')}` });
  const website = tags.website ?? tags['contact:website'] ?? tags.url;
  if (website) {
    const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    rows.push({ icon: 'website', label: 'Website', value: href.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''), href });
  }
  return [...rows, ...hoursRow(tags), ...accessRows(tags)];
}

function barrierRows(tags: Record<string, string>): DetailRow[] {
  const rows = hoursRow(tags);
  if (tags.locked === 'yes') rows.push({ icon: 'locked', label: 'Locked', value: 'Yes' });
  return [...rows, ...accessRows(tags)];
}

export function describe({ kind, object: { type, id, tags, geometry }, distance }: Nearby): Details {
  const name = tags.name ?? tags.brand ?? tags.operator;
  const rows = kind === 'road' ? roadRows(tags) : kind === 'poi' ? poiRows(tags) : barrierRows(tags);
  return {
    kind,
    title: titleOf(kind, tags),
    ...(name && { name }),
    distance,
    rows,
    url: `https://www.openstreetmap.org/${type}/${id}`,
    tags,
    geometry,
  };
}

/**
 * The nearest road or trail, place and barrier within `radius` metres of the spot,
 * described: from Postpass, or from the Overpass API where Postpass fails.
 */
export async function findDetails(spot: LngLat, radius: number): Promise<Details[]> {
  const objects = await postpassOrOverpass(
    () => askPostpass(postpassDetailsQuery(spot, radius), 10),
    async () => (await askOverpass(overpassDetailsQuery(spot, radius))).elements.map(fromOverpass),
  );
  return nearestByKind(objects, spot).map(describe);
}
