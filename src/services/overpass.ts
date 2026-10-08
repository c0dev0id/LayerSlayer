import type { LngLat } from '../model/route';
import { roundLngLat } from '../routing/legs';
import { fetchResource } from '../state/net';

/**
 * OpenStreetMap features found with the Overpass API (wiki.openstreetmap.org/wiki/Overpass_API)
 * within a polygon. Features are asked for by tag filters rather than query code. A filter
 * is one or more tags, separated by spaces, that a feature must all have: `key=value`, or
 * `key=*` (or just `key`) for any value. Keys and values with spaces go in double quotes.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Seconds the server may take before it gives up on a query. */
const TIMEOUT_S = 90;

/** A tag a feature must have: the key with this value, or with any value where none is given. */
interface TagCondition {
  key: string;
  value?: string;
}

/** A key, an optional value after `=`, then a space or the end. */
const CONDITION = /\s*("[^"]*"|[^\s="]+)(?:\s*=\s*("[^"]*"|[^\s"]+))?(?=\s|$)/y;

const unquote = (token: string) => (token.startsWith('"') ? token.slice(1, -1) : token);

/** The tags a filter names. Throws with the reason for one that cannot be read. */
export function parseFilter(text: string): TagCondition[] {
  const conditions: TagCondition[] = [];
  let at = 0;
  while (text.slice(at).trim()) {
    CONDITION.lastIndex = at;
    const match = CONDITION.exec(text);
    if (!match) throw new Error(`“${text.slice(at).trim()}” is not a tag: write key=value, or key=* for any value.`);
    at = CONDITION.lastIndex;
    const key = unquote(match[1]!);
    if (!key) throw new Error('A tag needs a key.');
    const value = match[2] === undefined || match[2] === '*' ? undefined : unquote(match[2]);
    conditions.push(value === undefined ? { key } : { key, value });
  }
  if (conditions.length === 0) throw new Error('Name at least one tag, e.g. amenity=bench.');
  return conditions;
}

/** A filter written the one way: `key=value` and `key=*`, quoted where needed. */
export function formatFilter(conditions: readonly TagCondition[]): string {
  const token = (s: string, special: RegExp) => (s === '' || special.test(s) ? `"${s}"` : s);
  return conditions.map(({ key, value }) => `${token(key, /[\s="]/)}=${value === undefined ? '*' : token(value, /[\s"]|^\*$/)}`).join(' ');
}

/** A string in Overpass QL. */
const ql = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * The query for the nodes, ways and relations matching any of the filters within the
 * polygon, answered as JSON with the geometry of each.
 */
export function overpassQuery(filters: readonly string[], area: readonly LngLat[]): string {
  const poly = area
    .map(roundLngLat)
    .map(([lng, lat]) => `${lat} ${lng}`)
    .join(' ');
  const statements = filters.map((filter) => {
    const tags = parseFilter(filter).map(({ key, value }) => (value === undefined ? `[${ql(key)}]` : `[${ql(key)}=${ql(value)}]`));
    return `nwr${tags.join('')}(poly:"${poly}");`;
  });
  return `[out:json][timeout:${TIMEOUT_S}];(${statements.join('')});out geom;`;
}

/** A point of an element's geometry. */
export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * An element of an Overpass answer asked for with `out geom`: its tags and where it lies.
 * With `out geom(box)`, points outside the box are null.
 */
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  /** A node's position. */
  lat?: number;
  lon?: number;
  /** A way's points. */
  geometry?: (LatLon | null)[];
  /** A relation's members, with their positions or points. */
  members?: ({ type: string; ref?: number; role?: string } & Partial<LatLon> & { geometry?: (LatLon | null)[] })[];
}

/** An Overpass answer in OSM JSON. */
interface OverpassAnswer {
  elements: OsmElement[];
  remark?: string;
}

/**
 * The answer, unless it reports an error. A query that runs out of time or memory still
 * answers with status 200, with what it found until then and a remark saying so.
 */
export function checkAnswer(json: unknown): OverpassAnswer {
  const answer = json as Partial<OverpassAnswer> | null;
  if (typeof answer !== 'object' || answer === null || !Array.isArray(answer.elements)) {
    throw new Error('The Overpass API did not answer with OpenStreetMap data.');
  }
  if (typeof answer.remark === 'string' && /error/i.test(answer.remark)) {
    throw new Error(`The Overpass API gave up: ${answer.remark.trim()} A smaller area or fewer features may work.`);
  }
  return answer as OverpassAnswer;
}

/** Converts an answer to GeoJSON features with the OSM tags as properties. */
export async function toGeoJson(answer: OverpassAnswer): Promise<GeoJSON.FeatureCollection> {
  const { default: osmtogeojson } = await import('osmtogeojson');
  return osmtogeojson(answer, { flatProperties: true }) as GeoJSON.FeatureCollection;
}

/** Sends an Overpass QL query and checks the answer. */
export async function askOverpass(query: string): Promise<OverpassAnswer> {
  const response = await fetchResource(OVERPASS_URL, { method: 'POST', body: new URLSearchParams({ data: query }) });
  return checkAnswer(await response.json());
}

/** The OSM features matching any of the filters within the polygon. */
export async function findOsmFeatures(filters: readonly string[], area: readonly LngLat[]): Promise<GeoJSON.FeatureCollection> {
  return toGeoJson(await askOverpass(overpassQuery(filters, area)));
}
