import { boxOf } from '../geo/bounds';
import { closestOnSegment, type XY } from '../geo/nearest';
import { METRES_PER_DEGREE, planeAt } from '../geo/plane';
import { simplifyLine } from '../geo/simplify';
import type { LngLat } from '../model/route';
import type { Surface } from '../model/routeColoring';
import { roundLngLat } from '../routing/legs';
import { postpassOrOverpass, type OsmObject } from './osm';
import { askOverpass, fromOverpass } from './overpass';
import { askPostpass } from './postpass';

/** Metres from a stretch of a route within which a road counts as the one it runs on. */
const REACH = 20;

/** The most a road's direction may differ from a stretch's, in degrees, for it to count as the one the stretch runs on. */
const MAX_TURN = 35;

const PAVED = new Set(['asphalt', 'chipseal', 'concrete', 'concrete:lanes', 'concrete:plates', 'paved', 'paving_stones', 'sett', 'cobblestone', 'unhewn_cobblestone', 'bricks', 'metal', 'wood']);
const COMPACTED = new Set(['compacted', 'fine_gravel']);
const GRAVEL = new Set(['gravel', 'pebblestone', 'rock', 'unpaved']);
const DIRT = new Set(['dirt', 'earth', 'ground', 'mud', 'sand', 'soil', 'woodchips']);
const GRASS = new Set(['grass', 'grass_paver']);
const TRACK_TYPES: Readonly<Record<string, Surface>> = { grade1: 'paved', grade2: 'compacted', grade3: 'gravel', grade4: 'dirt', grade5: 'dirt' };
/** Roads paved where they say nothing about their surface. */
const PAVED_ROADS = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|living_street)$/;

/** What a road's tags say it is made of: its surface, else its track type, else paved for main and residential roads. */
export function surfaceOf(tags: Readonly<Record<string, string>>): Surface {
  const surface = tags['surface'];
  if (surface !== undefined) {
    for (const [group, values] of [['paved', PAVED], ['compacted', COMPACTED], ['gravel', GRAVEL], ['dirt', DIRT], ['grass', GRASS]] as const) {
      if (values.has(surface)) return group;
    }
    return 'unknown';
  }
  return TRACK_TYPES[tags['tracktype'] ?? ''] ?? (PAVED_ROADS.test(tags['highway'] ?? '') ? 'paved' : 'unknown');
}

/** The Postpass query for the roads within REACH metres of the lines. */
export function postpassRoadQuery(lines: readonly (readonly LngLat[])[]): string {
  const meanLat = lines.flat().reduce((sum, p) => sum + p[1], 0) / lines.flat().length;
  // Degrees of longitude, the wider ones, so that the reach holds in every direction.
  const degrees = REACH / (METRES_PER_DEGREE * Math.cos((meanLat * Math.PI) / 180));
  const parts = lines.map((line) => `(${line.map(roundLngLat).map(([lng, lat]) => `${lng} ${lat}`).join(',')})`);
  return (
    "SELECT osm_type, osm_id, tags, geom FROM postpass_line WHERE tags ? 'highway' " +
    `AND ST_DWithin(geom, ST_GeomFromText('MULTILINESTRING(${parts.join(',')})', 4326), ${degrees.toFixed(6)})`
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

interface Road {
  surface: Surface;
  line: XY[];
  box: [number, number, number, number];
}

/**
 * The surface of each stretch between consecutive points of each line: that of the nearest
 * road within REACH metres of the stretch's middle that runs along it, so that a road
 * crossing it does not count; unknown where there is none.
 */
export function matchSurfaces(lines: readonly (readonly LngLat[])[], roads: readonly OsmObject[]): Surface[][] {
  const points = lines.flat();
  if (points.length === 0) return lines.map(() => []);
  const toPlane = planeAt(points);
  const candidates: Road[] = roads.flatMap((road) =>
    runsOf(road.geometry).map((run) => {
      const line = run.map(toPlane);
      return { surface: surfaceOf(road.tags), line, box: boxOf(line) };
    }),
  );
  return lines.map((line) => {
    const xy = line.map(toPlane);
    return xy.slice(1).map((to, i) => surfaceAlong(xy[i]!, to, candidates));
  });
}

/** The lines a road's geometry is made of. */
function runsOf(geometry: GeoJSON.Geometry): LngLat[][] {
  if (geometry.type === 'LineString') return [geometry.coordinates as LngLat[]];
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates as LngLat[][];
  return [];
}

function surfaceAlong(from: XY, to: XY, roads: readonly Road[]): Surface {
  const middle: XY = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dy);
  const minCos = Math.cos((MAX_TURN * Math.PI) / 180);
  let best: { distance: number; surface: Surface } | undefined;
  for (const road of roads) {
    const [minX, minY, maxX, maxY] = road.box;
    if (middle[0] < minX - REACH || middle[0] > maxX + REACH || middle[1] < minY - REACH || middle[1] > maxY + REACH) continue;
    for (let i = 1; i < road.line.length; i++) {
      const [a, b] = [road.line[i - 1]!, road.line[i]!];
      const near = closestOnSegment(middle, a, b);
      const distance = Math.hypot(middle[0] - near[0], middle[1] - near[1]);
      if (distance > REACH || (best && distance >= best.distance)) continue;
      const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
      const span = length * Math.hypot(ex, ey);
      if (span > 0 && Math.abs(dx * ex + dy * ey) / span < minCos) continue;
      best = { distance, surface: road.surface };
    }
  }
  return best?.surface ?? 'unknown';
}
