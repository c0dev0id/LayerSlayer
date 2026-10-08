import type { LngLat } from '../model/route';
import { fetchResource, HttpError } from '../state/net';

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
export interface TagCondition {
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

const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

/**
 * The query for the nodes, ways and relations matching any of the filters within the
 * polygon, answered as JSON with the geometry of each.
 */
export function overpassQuery(filters: readonly string[], area: readonly LngLat[]): string {
  const poly = area.map(([lng, lat]) => `${round(lat)} ${round(lng)}`).join(' ');
  const statements = [...new Set(filters)].map((filter) => {
    const tags = parseFilter(filter).map(({ key, value }) => (value === undefined ? `[${ql(key)}]` : `[${ql(key)}=${ql(value)}]`));
    return `nwr${tags.join('')}(poly:"${poly}");`;
  });
  return `[out:json][timeout:${TIMEOUT_S}];(${statements.join('')});out geom;`;
}

/** An Overpass answer in OSM JSON. */
export interface OverpassAnswer {
  elements: unknown[];
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
    throw new Error(`The Overpass API gave up: ${answer.remark.trim()} A smaller focus area or fewer features may work.`);
  }
  return answer as OverpassAnswer;
}

/** Converts an answer to GeoJSON features with the OSM tags as properties. */
export async function toGeoJson(answer: OverpassAnswer): Promise<GeoJSON.FeatureCollection> {
  const { default: osmtogeojson } = await import('osmtogeojson');
  return osmtogeojson(answer, { flatProperties: true }) as GeoJSON.FeatureCollection;
}

/** Explains the busy answers of the Overpass API, which come as HTML pages. */
function busyMessage(error: unknown): unknown {
  if (!(error instanceof HttpError)) return error;
  if (error.status === 429) return new Error('The Overpass API is still busy with earlier queries from this address. Try again in a minute.');
  if (error.status === 504) return new Error('The Overpass API is overloaded right now. Try again later.');
  return error;
}

/** The OSM features matching any of the filters within the polygon. */
export async function findOsmFeatures(filters: readonly string[], area: readonly LngLat[]): Promise<GeoJSON.FeatureCollection> {
  const body = new URLSearchParams({ data: overpassQuery(filters, area) });
  const response = await fetchResource(OVERPASS_URL, { method: 'POST', body }).catch((error: unknown) => {
    throw busyMessage(error);
  });
  return toGeoJson(checkAnswer(await response.json()));
}
