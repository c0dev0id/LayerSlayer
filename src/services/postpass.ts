import type { LngLat } from '../model/route';
import { roundLngLat } from '../routing/legs';
import { fetchResource } from '../state/net';
import { parseFilter } from './overpass';

/**
 * OpenStreetMap features found with Postpass (github.com/woodpeck/postpass), a public
 * PostGIS copy of OSM run by Geofabrik that answers SQL with GeoJSON. Features are asked
 * for by the same tag filters as with the Overpass API. Its tables hold tagged nodes as
 * points, ways and route and boundary relations as lines, closed ways and multipolygon
 * and boundary relations as polygons, each with `osm_type`, `osm_id` and the tags as jsonb.
 */

export const POSTPASS_URL = 'https://postpass.geofabrik.de/api/interpreter';

/** A string in SQL. */
const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Text that LIKE matches literally: its wildcards and the escape character escaped. */
const literal = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** One filter as an SQL condition: tags with a value, any value, or a value containing the text. */
function condition(filter: string): string {
  const parts = parseFilter(filter).map(({ key, value, contains }) => {
    if (value === undefined) return `tags ? ${sql(key)}`;
    if (contains) return `tags->>${sql(key)} ILIKE ${sql(`%${literal(value)}%`)}`;
    return `tags @> ${sql(JSON.stringify({ [key]: value }))}::jsonb`;
  });
  return `(${parts.join(' AND ')})`;
}

/**
 * The query for the features matching any of the filters within the polygon. A boundary
 * relation is in the lines and the polygons alike; only its polygon is kept.
 */
export function postpassQuery(filters: readonly string[], area: readonly LngLat[]): string {
  const ring = [...area, area[0]!].map(roundLngLat).map(([lng, lat]) => `${lng} ${lat}`);
  return (
    'SELECT DISTINCT ON (osm_type, osm_id) osm_type, osm_id, tags, geom FROM postpass_pointlinepolygon ' +
    `WHERE ST_Intersects(geom, ST_GeomFromText('POLYGON((${ring.join(',')}))', 4326)) ` +
    `AND (${filters.map(condition).join(' OR ')}) ` +
    'ORDER BY osm_type, osm_id, area_m2 IS NULL'
  );
}

const OSM_TYPES: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };

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

/**
 * A Postpass answer as the features of an OSM query layer: identified as `way/123`, with
 * the tags as properties beside that `id`, as osmtogeojson gives them for Overpass answers.
 */
export function fromPostpass(json: unknown): GeoJSON.FeatureCollection {
  const answer = json as { type?: unknown; features?: unknown } | null;
  if (answer?.type !== 'FeatureCollection' || !Array.isArray(answer.features)) {
    throw new Error('Postpass did not answer with OpenStreetMap data.');
  }
  const features = (answer.features as PostpassFeature[]).map(({ geometry, properties: { osm_type, osm_id, tags } }): GeoJSON.Feature => {
    const id = `${OSM_TYPES[osm_type] ?? osm_type}/${osm_id}`;
    return { type: 'Feature', id, geometry: single(geometry), properties: { ...tags, id } };
  });
  return { type: 'FeatureCollection', features };
}

/** The OSM features matching any of the filters within the polygon, from Postpass. */
export async function findWithPostpass(filters: readonly string[], area: readonly LngLat[]): Promise<GeoJSON.FeatureCollection> {
  const response = await fetchResource(POSTPASS_URL, { method: 'POST', body: new URLSearchParams({ data: postpassQuery(filters, area) }) });
  return fromPostpass(await response.json());
}
