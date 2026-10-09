import type { LngLat } from '../model/route';
import { roundLngLat } from '../routing/legs';
import { fetchResource } from '../state/net';
import { parseFilter, type OsmObject } from './osm';

/**
 * OpenStreetMap features found with Postpass (github.com/woodpeck/postpass), a public
 * PostGIS copy of OSM run by Geofabrik that answers SQL with GeoJSON. Features are asked
 * for by the same tag filters as with the Overpass API. Its tables hold tagged nodes as
 * points, ways and route and boundary relations as lines, closed ways and multipolygon
 * and boundary relations as polygons, each with `osm_type`, `osm_id` and the tags as jsonb.
 */

export const POSTPASS_URL = 'https://postpass.geofabrik.de/api/interpreter';

/** A string in SQL. */
export const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Text that LIKE matches literally: its wildcards and the escape character escaped. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** One filter as an SQL condition: tags with a value, any value, or a value containing the text. */
function condition(filter: string): string {
  const parts = parseFilter(filter).map((condition) => {
    const { key } = condition;
    if (condition.op === 'any') return `tags ? ${sql(key)}`;
    if (condition.op === 'contains') return `tags->>${sql(key)} ILIKE ${sql(`%${likeLiteral(condition.value)}%`)}`;
    return `tags @> ${sql(JSON.stringify({ [key]: condition.value }))}::jsonb`;
  });
  return `(${parts.join(' AND ')})`;
}

/**
 * The OSM objects matching any of the conditions, `geom` being what each is given as. Each
 * condition is a query of its own, so that each can use the index that fits it (tags or
 * geometry), which an OR across them all would rule out. A boundary relation is in the
 * lines and the polygons alike; one row of each object is kept, its polygon where it has one.
 */
export function selectObjects(geom: string, conditions: readonly string[]): string {
  const rows = conditions.map((where) => `SELECT osm_type, osm_id, tags, ${geom} AS geom, area_m2 FROM postpass_pointlinepolygon WHERE ${where}`);
  return `SELECT DISTINCT ON (osm_type, osm_id) osm_type, osm_id, tags, geom FROM (${rows.join(' UNION ALL ')}) AS found ORDER BY osm_type, osm_id, area_m2 IS NULL`;
}

/** The query for the features matching any of the filters within the polygon. */
export function postpassQuery(filters: readonly string[], area: readonly LngLat[]): string {
  const ring = [...area, area[0]!].map(roundLngLat).map(([lng, lat]) => `${lng} ${lat}`);
  const within = `ST_Intersects(geom, ST_GeomFromText('POLYGON((${ring.join(',')}))', 4326))`;
  return selectObjects('geom', filters.map((filter) => `${within} AND ${condition(filter)}`));
}

const OSM_TYPES: Record<string, OsmObject['type']> = { N: 'node', W: 'way', R: 'relation' };

interface PostpassFeature {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: { osm_type: string; osm_id: number; tags: Record<string, string> | null };
}

/** A multi-geometry of one part as that part, as osmtogeojson writes single ways. */
function single(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === 'MultiLineString' && geometry.coordinates.length === 1) return { type: 'LineString', coordinates: geometry.coordinates[0]! };
  if (geometry.type === 'MultiPolygon' && geometry.coordinates.length === 1) return { type: 'Polygon', coordinates: geometry.coordinates[0]! };
  return geometry;
}

/** The OSM objects of a Postpass answer, unless it is none. */
export function readPostpass(json: unknown): OsmObject[] {
  const answer = json as { type?: unknown; features?: unknown } | null;
  if (answer?.type !== 'FeatureCollection' || !Array.isArray(answer.features)) {
    throw new Error('Postpass did not answer with OpenStreetMap data.');
  }
  return (answer.features as PostpassFeature[]).map(({ geometry, properties: { osm_type, osm_id, tags } }) => ({
    type: OSM_TYPES[osm_type] ?? 'node',
    id: osm_id,
    tags: tags ?? {},
    geometry: single(geometry),
  }));
}

/**
 * OSM objects as the features of an OSM query layer: identified as `way/123`, with the
 * tags as properties beside that `id`, as osmtogeojson gives them for Overpass answers.
 */
export function asFeatures(objects: readonly OsmObject[]): GeoJSON.FeatureCollection {
  const features = objects.map(({ type, id, tags, geometry }): GeoJSON.Feature => {
    const key = `${type}/${id}`;
    return { type: 'Feature', id: key, geometry, properties: { ...tags, id: key } };
  });
  return { type: 'FeatureCollection', features };
}

/**
 * Sends an SQL query to Postpass and reads the OSM objects it answers with, giving up after
 * `seconds` so that the Overpass API is asked in time when Postpass is overloaded.
 */
export async function askPostpass(query: string, seconds: number): Promise<OsmObject[]> {
  const init = { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(seconds * 1000) };
  return readPostpass(await (await fetchResource(POSTPASS_URL, init)).json());
}

/** The OSM features matching any of the filters within the polygon, from Postpass. */
export async function findWithPostpass(filters: readonly string[], area: readonly LngLat[]): Promise<GeoJSON.FeatureCollection> {
  return asFeatures(await askPostpass(postpassQuery(filters, area), 60));
}
