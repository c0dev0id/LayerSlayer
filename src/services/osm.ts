import { errorMessage } from '../state/net';

/**
 * What the OpenStreetMap sources have in common: the tag filters features are asked for
 * by, the objects their answers become, and asking Postpass before the Overpass API.
 *
 * A filter is one or more tags, separated by spaces, that a feature must all have:
 * `key=value`, `key=*` (or just `key`) for any value, or `key~text` for a value containing
 * the text, whatever its case. Keys and values with spaces go in double quotes.
 */

export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Where OSM data shown in the app comes from, for the credit under it. */
export const OSM_CREDIT = 'Data © OpenStreetMap contributors, found with Postpass, or the Overpass API where Postpass fails.';

/** A tag a feature must have: with any value, with this value, or with a value containing this text in any case. */
export type TagCondition = { key: string; op: 'any' } | { key: string; op: 'eq' | 'contains'; value: string };

/** A key, an optional `=` or `~` and value, then a space or the end. */
const CONDITION = /\s*("[^"]*"|[^\s=~"]+)(?:\s*([=~])\s*("[^"]*"|[^\s"]+))?(?=\s|$)/y;

const unquote = (token: string) => (token.startsWith('"') ? token.slice(1, -1) : token);

/** The tags a filter names. Throws with the reason for one that cannot be read. */
export function parseFilter(text: string): TagCondition[] {
  const conditions: TagCondition[] = [];
  let at = 0;
  while (text.slice(at).trim()) {
    CONDITION.lastIndex = at;
    const match = CONDITION.exec(text);
    if (!match) throw new Error(`“${text.slice(at).trim()}” is not a tag: write key=value, key=* for any value, or key~text for values containing it.`);
    at = CONDITION.lastIndex;
    const key = unquote(match[1]!);
    if (!key) throw new Error('A tag needs a key.');
    const [operator, token] = [match[2], match[3]];
    if (operator === '~') conditions.push({ key, op: 'contains', value: unquote(token!) });
    else conditions.push(token === undefined || token === '*' ? { key, op: 'any' } : { key, op: 'eq', value: unquote(token) });
  }
  if (conditions.length === 0) throw new Error('Name at least one tag, e.g. amenity=bench.');
  return conditions;
}

/** A filter written the one way: `key=value`, `key=*` and `key~text`, quoted where needed. */
export function formatFilter(conditions: readonly TagCondition[]): string {
  const token = (s: string, special: RegExp) => (s === '' || special.test(s) ? `"${s}"` : s);
  return conditions
    .map((condition) => {
      const name = token(condition.key, /[\s=~"]/);
      if (condition.op === 'any') return `${name}=*`;
      if (condition.op === 'contains') return `${name}~${token(condition.value, /[\s"]/)}`;
      return `${name}=${token(condition.value, /[\s"]|^\*$/)}`;
    })
    .join(' ');
}

/** What a query asks a source for: the tags of a filter, or a value containing any of the texts. */
export type Search = { conditions: TagCondition[] } | { key: string; texts: string[] };

/**
 * The filters as a query asks for them. Filters that only look for a text in the same key
 * become one search for any of their texts: no index finds text within values, so each
 * such search reads every object in the area, and joined they read the objects once.
 */
export function searchesOf(filters: readonly string[]): Search[] {
  const searches: Search[] = [];
  const textSearches = new Map<string, { key: string; texts: string[] }>();
  for (const filter of filters) {
    const conditions = parseFilter(filter);
    const only = conditions.length === 1 ? conditions[0]! : undefined;
    if (only?.op !== 'contains') {
      searches.push({ conditions });
      continue;
    }
    const search = textSearches.get(only.key);
    if (search) search.texts.push(only.value);
    else {
      const created = { key: only.key, texts: [only.value] };
      textSearches.set(only.key, created);
      searches.push(created);
    }
  }
  return searches;
}

/** Whether OSM tags match a filter, as the sources find them. */
export function matchesFilter(filter: string, tags: Readonly<Record<string, string>>): boolean {
  return parseFilter(filter).every((condition) => {
    const tag = tags[condition.key];
    if (condition.op === 'any') return tag !== undefined;
    if (condition.op === 'contains') return tag?.toLowerCase().includes(condition.value.toLowerCase()) === true;
    return tag === condition.value;
  });
}

/** An OSM object as the details read it from either source: what it is, its tags and where it lies. */
export interface OsmObject {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  geometry: GeoJSON.Geometry;
}

/**
 * The answer from Postpass, which answers in about a second, or from the Overpass API where
 * Postpass fails; where neither answers, an error naming both reasons. Both are public
 * services run by volunteers, and either may be overloaded or down for a while.
 */
export async function postpassOrOverpass<T>(postpass: () => Promise<T>, overpass: () => Promise<T>): Promise<T> {
  try {
    return await postpass();
  } catch (postpassError) {
    try {
      return await overpass();
    } catch (overpassError) {
      throw new Error(`Postpass: ${errorMessage(postpassError)} Overpass API: ${errorMessage(overpassError)}`);
    }
  }
}
