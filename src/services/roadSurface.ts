import { closestOnSegment, type XY } from '../geo/nearest';
import { meanLatitude, metresPerDegreeEast, planeAt } from '../geo/plane';
import { simplifyLine } from '../geo/simplify';
import type { LngLat } from '../model/route';
import type { Surface } from '../model/routeColoring';
import { roundLngLat } from '../routing/legs';
import { postpassOrOverpass, type OsmObject } from './osm';
import { askOverpass, fromOverpass } from './overpass';
import { askPostpass } from './postpass';

/** Metres from a stretch of a route within which a road counts as the one it runs on. */
const REACH = 20;

/** The least cosine of the angle between a road and a stretch for the road to count as the one the stretch runs on: 35°. */
const MIN_COS = Math.cos((35 * Math.PI) / 180);

/** Metres of a route's course asked about in one part of the query, so that each part's box around it stays small. */
const PART = 5000;

/** The values of OSM's surface tag in each group. */
const GROUPS: Readonly<Record<Exclude<Surface, 'unknown'>, readonly string[]>> = {
  paved: ['asphalt', 'chipseal', 'concrete', 'concrete:lanes', 'concrete:plates', 'paved', 'paving_stones', 'sett', 'cobblestone', 'unhewn_cobblestone', 'bricks', 'metal', 'wood'],
  compacted: ['compacted', 'fine_gravel'],
  gravel: ['gravel', 'pebblestone', 'rock', 'unpaved'],
  dirt: ['dirt', 'earth', 'ground', 'mud', 'sand', 'soil', 'woodchips'],
  grass: ['grass', 'grass_paver'],
};
const GROUP_OF = new Map(Object.entries(GROUPS).flatMap(([group, values]) => values.map((value) => [value, group as Surface])));
const TRACK_TYPES: Readonly<Record<string, Surface>> = { grade1: 'paved', grade2: 'compacted', grade3: 'gravel', grade4: 'dirt', grade5: 'dirt' };
/** Roads paved where they say nothing about their surface. */
const PAVED_ROADS = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|living_street)$/;

/** What a road's tags say it is made of: its surface, else its track type, else paved for main and residential roads. */
export function surfaceOf(tags: Readonly<Record<string, string>>): Surface {
  const surface = tags['surface'];
  if (surface !== undefined) return GROUP_OF.get(surface) ?? 'unknown';
  return TRACK_TYPES[tags['tracktype'] ?? ''] ?? (PAVED_ROADS.test(tags['highway'] ?? '') ? 'paved' : 'unknown');
}

/** The line cut into consecutive parts of about PART metres. */
function parts(line: readonly LngLat[]): LngLat[][] {
  const toPlane = planeAt(line);
  const result: LngLat[][] = [];
  let part: LngLat[] = [line[0]!];
  let length = 0;
  for (let i = 1; i < line.length; i++) {
    const [[ax, ay], [bx, by]] = [toPlane(line[i - 1]!), toPlane(line[i]!)];
    length += Math.hypot(bx - ax, by - ay);
    part.push(line[i]!);
    if (length >= PART && i < line.length - 1) {
      result.push(part);
      [part, length] = [[line[i]!], 0];
    }
  }
  result.push(part);
  return result;
}

/**
 * The Postpass query for the roads within REACH metres of the lines, with the tags that
 * say what they are made of. The lines are asked about in parts: a road is first found by
 * the box around a part, and one box around a long route holds every road in its region.
 */
export function postpassRoadQuery(lines: readonly (readonly LngLat[])[]): string {
  // Degrees of longitude, the wider ones, so that the reach holds in every direction.
  const degrees = REACH / metresPerDegreeEast(meanLatitude(lines.flat()));
  const course = lines.flatMap(parts).map((part) => `(ST_GeomFromText('LINESTRING(${part.map(roundLngLat).map(([lng, lat]) => `${lng} ${lat}`).join(',')})', 4326))`);
  const tags = ['highway', 'surface', 'tracktype'].map((key) => `'${key}', road.tags->'${key}'`).join(', ');
  return (
    `SELECT DISTINCT ON (road.osm_type, road.osm_id) road.osm_type, road.osm_id, jsonb_strip_nulls(jsonb_build_object(${tags})) AS tags, road.geom ` +
    `FROM (VALUES ${course.join(',')}) AS course(line) JOIN postpass_line AS road ON ST_DWithin(road.geom, course.line, ${degrees.toFixed(6)}) ` +
    "WHERE road.tags ? 'highway'"
  );
}

/** The Overpass API query for the roads within REACH metres of the lines. */
export function overpassRoadQuery(lines: readonly (readonly LngLat[])[]): string {
  const statements = lines.map((line) => `way[highway](around:${REACH},${line.map(roundLngLat).map(([lng, lat]) => `${lat},${lng}`).join(',')});`);
  return `[out:json][timeout:60];(${statements.join('')});out tags geom;`;
}

/** The roads near the lines, with their tags and geometry: from Postpass, or the Overpass API where Postpass fails. */
export function roadsAlong(lines: readonly (readonly LngLat[])[]): Promise<OsmObject[]> {
  // The query only needs the lines' course: a few metres off is well within the reach.
  const course = lines.map((line) => simplifyLine(line, 5));
  return postpassOrOverpass(
    () => askPostpass(postpassRoadQuery(course), 30),
    async () => (await askOverpass(overpassRoadQuery(course))).elements.map(fromOverpass),
  );
}

/** A straight piece of a road, on the plane. */
interface Segment {
  surface: Surface;
  a: XY;
  b: XY;
}

/** Metres a cell of the grid road segments are found by spans: a stretch's middle looks in its cell and the eight around it. */
const CELL = 2 * REACH;

const cellOf = (v: number) => Math.floor(v / CELL);

/**
 * The surface of each stretch between consecutive points of each line: that of the nearest
 * road within REACH metres of the stretch's middle that runs along it, so that a road
 * crossing it does not count; unknown where there is none.
 */
export function matchSurfaces(lines: readonly (readonly LngLat[])[], roads: readonly OsmObject[]): Surface[][] {
  const toPlane = planeAt(lines.flat());
  const grid = new Map<string, Segment[]>();
  for (const road of roads) {
    const surface = surfaceOf(road.tags);
    for (const run of runsOf(road.geometry)) {
      const line = run.map(toPlane);
      for (let i = 1; i < line.length; i++) {
        const segment = { surface, a: line[i - 1]!, b: line[i]! };
        const [x0, x1] = [cellOf(segment.a[0]), cellOf(segment.b[0])].sort((m, n) => m - n) as [number, number];
        const [y0, y1] = [cellOf(segment.a[1]), cellOf(segment.b[1])].sort((m, n) => m - n) as [number, number];
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const key = `${cx},${cy}`;
            const cell = grid.get(key) ?? grid.set(key, []).get(key)!;
            cell.push(segment);
          }
        }
      }
    }
  }
  return lines.map((line) => {
    const xy = line.map(toPlane);
    return xy.slice(1).map((to, i) => surfaceAlong(xy[i]!, to, grid));
  });
}

/** The lines a road's geometry is made of. */
function runsOf(geometry: GeoJSON.Geometry): LngLat[][] {
  if (geometry.type === 'LineString') return [geometry.coordinates as LngLat[]];
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates as LngLat[][];
  return [];
}

function surfaceAlong(from: XY, to: XY, grid: ReadonlyMap<string, readonly Segment[]>): Surface {
  const middle: XY = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dy);
  let [nearest, surface]: [number, Surface] = [Infinity, 'unknown'];
  const [cx, cy] = [cellOf(middle[0]), cellOf(middle[1])];
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (const { a, b, surface: made } of grid.get(`${cx + ox},${cy + oy}`) ?? []) {
        const near = closestOnSegment(middle, a, b);
        const distance = Math.hypot(middle[0] - near[0], middle[1] - near[1]);
        if (distance > REACH || distance >= nearest) continue;
        const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
        const span = length * Math.hypot(ex, ey);
        if (span > 0 && Math.abs(dx * ex + dy * ey) / span < MIN_COS) continue;
        [nearest, surface] = [distance, made];
      }
    }
  }
  return surface;
}
