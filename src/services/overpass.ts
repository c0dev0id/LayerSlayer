import type { LngLat } from '../model/route';
import { roundLngLat } from '../routing/legs';
import { fetchResource } from '../state/net';
import { parseFilter, type OsmObject } from './osm';

/**
 * OpenStreetMap features found with the Overpass API (wiki.openstreetmap.org/wiki/Overpass_API)
 * within a polygon, asked for by the tag filters of services/osm rather than query code.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Seconds the server may take before it gives up on a query. */
const TIMEOUT_S = 90;

/** A string in Overpass QL. */
const ql = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Text as a regular expression that finds it literally. */
const regexLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    const tags = parseFilter(filter).map((condition) => {
      const key = ql(condition.key);
      if (condition.op === 'any') return `[${key}]`;
      if (condition.op === 'contains') return `[${key}~${ql(regexLiteral(condition.value))},i]`;
      return `[${key}=${ql(condition.value)}]`;
    });
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

/** The OSM features matching any of the filters within the polygon, from the Overpass API. */
export async function findWithOverpass(filters: readonly string[], area: readonly LngLat[]): Promise<GeoJSON.FeatureCollection> {
  return toGeoJson(await askOverpass(overpassQuery(filters, area)));
}

/** The unbroken stretches of points of a geometry whose points outside a box were left out. */
function stretches(points: readonly (LatLon | null)[] | undefined): LatLon[][] {
  const runs: LatLon[][] = [[]];
  for (const point of points ?? []) {
    if (point) runs.at(-1)!.push(point);
    else if (runs.at(-1)!.length > 0) runs.push([]);
  }
  return runs.filter((run) => run.length > 0);
}

/** An Overpass element as an OSM object, as Postpass answers give them too. */
export function fromOverpass(element: OsmElement): OsmObject {
  return { type: element.type, id: element.id, tags: element.tags ?? {}, geometry: geometryOf(element) };
}

/** An Overpass element's geometry as GeoJSON: areas as their outlines, which is what a highlight draws. */
export function geometryOf(element: OsmElement): GeoJSON.Geometry {
  if (element.lat !== undefined && element.lon !== undefined) return { type: 'Point', coordinates: [element.lon, element.lat] };
  const toLine = (run: LatLon[]) => run.map((p) => [p.lon, p.lat]);
  if (element.geometry) {
    const runs = stretches(element.geometry).map(toLine);
    return runs.length === 1 ? { type: 'LineString', coordinates: runs[0]! } : { type: 'MultiLineString', coordinates: runs };
  }
  const members = element.members ?? [];
  const lines = members.flatMap((m) => stretches(m.geometry).map(toLine));
  if (lines.length > 0) return { type: 'MultiLineString', coordinates: lines };
  return { type: 'MultiPoint', coordinates: members.flatMap((m) => (m.lat !== undefined && m.lon !== undefined ? [[m.lon, m.lat]] : [])) };
}
