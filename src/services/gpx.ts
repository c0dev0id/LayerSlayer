import type { LngLat, Waypoint } from '../model/route';
import { child, children, parseXml, text } from './xml';

/** GPX 1.1 out; waypoints, routes and tracks of GPX 1.0 and 1.1 in. */

export interface Track {
  name: string;
  points: LngLat[];
}

const ENTITIES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ENTITIES[c]!);
}

/** GPX requires -180 <= lon < 180. */
function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

const coordinates = ([lng, lat]: LngLat) => `lat="${lat.toFixed(6)}" lon="${wrapLongitude(lng).toFixed(6)}"`;

/** A GPX 1.1 document with the waypoints first, then one track (and segment) per entry. */
export function toGpx(name: string, waypoints: readonly Waypoint[], tracks: readonly Track[], time: Date): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Layer Slayer" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${escapeXml(name)}</name>`,
    `    <time>${time.toISOString()}</time>`,
    '  </metadata>',
  ];
  for (const point of waypoints) {
    lines.push(`  <wpt ${coordinates(point.lngLat)}>`, `    <name>${escapeXml(point.name)}</name>`);
    if (point.description) lines.push(`    <desc>${escapeXml(point.description)}</desc>`);
    lines.push('  </wpt>');
  }
  for (const track of tracks) {
    lines.push('  <trk>', `    <name>${escapeXml(track.name)}</name>`, '    <trkseg>');
    for (const point of track.points) lines.push(`      <trkpt ${coordinates(point)}/>`);
    lines.push('    </trkseg>', '  </trk>');
  }
  lines.push('</gpx>', '');
  return lines.join('\n');
}

/** What a GPX file holds: waypoints, routes (`rte`) and tracks (`trk`) with their segments. */
export interface GpxContent {
  waypoints: { lngLat: LngLat; name?: string; description?: string }[];
  /** `course` is the line a Garmin device or BaseCamp calculated for the route, where the file has it. */
  routes: { name?: string; points: LngLat[]; course?: LngLat[] }[];
  tracks: { name?: string; segments: LngLat[][] }[];
}

function position(element: Element): LngLat | undefined {
  const lat = Number(element.getAttribute('lat'));
  const lng = Number(element.getAttribute('lon'));
  return element.hasAttribute('lat') && element.hasAttribute('lon') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90
    ? [lng, lat]
    : undefined;
}

const positions = (elements: Element[]) => elements.map(position).filter((p): p is LngLat => p !== undefined);

/** The points Garmin's extension gives a route point for the way on to the next (`gpxx:RoutePointExtension`, `gpxx:rpt`). */
function garminShape(rtept: Element): Element[] {
  const extension = child(rtept, 'extensions', 'RoutePointExtension');
  return extension ? children(extension, 'rpt') : [];
}

/** A route from its points, with the course Garmin calculated where its points carry one. */
function route(rte: Element): GpxContent['routes'][number] {
  const rtepts = children(rte, 'rtept');
  const name = text(rte, 'name');
  const points = positions(rtepts);
  if (!rtepts.some((p) => garminShape(p).length > 0)) return { name, points };
  return { name, points, course: positions(rtepts.flatMap((p) => [p, ...garminShape(p)])) };
}

/** Reads a GPX 1.0 or 1.1 document. */
export function parseGpx(xml: string): GpxContent {
  const root = parseXml(xml, 'This is not a GPX file.', 'gpx');
  return {
    waypoints: children(root, 'wpt').flatMap((w) => {
      const lngLat = position(w);
      return lngLat ? [{ lngLat, name: text(w, 'name'), description: text(w, 'desc') ?? text(w, 'cmt') }] : [];
    }),
    routes: children(root, 'rte').map(route),
    tracks: children(root, 'trk').map((t) => ({
      name: text(t, 'name'),
      segments: children(t, 'trkseg').map((segment) => positions(children(segment, 'trkpt'))),
    })),
  };
}

/**
 * The tracks of a GPX document as GeoJSON, one feature per track named by its `name`:
 * a line, or a multi-line where the track has several segments. Segments of fewer than
 * two points are left out. Routes with the course Garmin calculated for them are as good
 * as tracks and come first; other routes and the waypoints are not read.
 */
export function gpxTracksGeoJson(xml: string): GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString> {
  const gpx = parseGpx(xml);
  const courses = gpx.routes.flatMap((r) => (r.course ? [{ name: r.name, segments: [r.course] }] : []));
  const features = [...courses, ...gpx.tracks].flatMap((track) => {
    const segments = track.segments.filter((line) => line.length >= 2);
    if (segments.length === 0) return [];
    const geometry: GeoJSON.LineString | GeoJSON.MultiLineString =
      segments.length === 1 ? { type: 'LineString', coordinates: segments[0]! } : { type: 'MultiLineString', coordinates: segments };
    return [{ type: 'Feature' as const, properties: { name: track.name ?? null }, geometry }];
  });
  return { type: 'FeatureCollection', features };
}
