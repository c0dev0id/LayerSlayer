import { simplifyToCount } from '../geo/simplify';
import type { LngLat, Profile, Route, RouteData, Waypoint } from '../model/route';
import { children, descendants, text } from '../services/xml';
import { roundLngLat, routePoints, withoutRepeats } from './legs';
import { decodePolyline } from './polyline';
import { nextRouteColor } from './routeEdit';

/** GPX 1.1 out, and routes, tracks and waypoints in. */

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
    '<gpx version="1.1" creator="webmap" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
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

/** Tracks for every route with at least two points. */
export function routeTracks(routes: readonly Route[], decode = decodePolyline): Track[] {
  return routes.filter((r) => r.points.length >= 2).map((r) => ({ name: r.name, points: routePoints(r, decode) }));
}

/** What a GPX file holds: waypoints, routes (`rte`) and tracks (`trk`, segments joined). */
export interface GpxContent {
  waypoints: { lngLat: LngLat; name?: string; description?: string }[];
  routes: { name?: string; points: LngLat[] }[];
  tracks: { name?: string; points: LngLat[] }[];
}

function position(element: Element): LngLat | undefined {
  const lat = Number(element.getAttribute('lat'));
  const lng = Number(element.getAttribute('lon'));
  return element.hasAttribute('lat') && element.hasAttribute('lon') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90
    ? [lng, lat]
    : undefined;
}

const positions = (elements: Element[]) => elements.map(position).filter((p): p is LngLat => p !== undefined);

/** The root of a GPX 1.0 or 1.1 document. */
function gpxRoot(xml: string): Element {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (doc.getElementsByTagName('parsererror')[0] || root.localName !== 'gpx') throw new Error('This is not a GPX file.');
  return root;
}

/** Reads a GPX 1.0 or 1.1 document. */
export function parseGpx(xml: string): GpxContent {
  const root = gpxRoot(xml);
  return {
    waypoints: children(root, 'wpt').flatMap((w) => {
      const lngLat = position(w);
      return lngLat ? [{ lngLat, name: text(w, 'name'), description: text(w, 'desc') ?? text(w, 'cmt') }] : [];
    }),
    routes: children(root, 'rte').map((r) => ({ name: text(r, 'name'), points: positions(children(r, 'rtept')) })),
    tracks: children(root, 'trk').map((t) => ({ name: text(t, 'name'), points: positions(descendants(t, 'trkpt')) })),
  };
}

/**
 * The tracks of a GPX document as GeoJSON, one feature per track named by its `name`:
 * a line, or a multi-line where the track has several segments. Segments of fewer than
 * two points are left out; routes and waypoints are not read.
 */
export function gpxTracksGeoJson(xml: string): GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString> {
  const features = children(gpxRoot(xml), 'trk').flatMap((track) => {
    const segments = children(track, 'trkseg')
      .map((segment) => positions(children(segment, 'trkpt')))
      .filter((line) => line.length >= 2);
    if (segments.length === 0) return [];
    const geometry: GeoJSON.LineString | GeoJSON.MultiLineString =
      segments.length === 1 ? { type: 'LineString', coordinates: segments[0]! } : { type: 'MultiLineString', coordinates: segments };
    return [{ type: 'Feature' as const, properties: { name: text(track, 'name') ?? null }, geometry }];
  });
  return { type: 'FeatureCollection', features };
}

/** A GPX route with more points than this is a track in disguise; routing each leg would take minutes. */
export const MAX_ROUTED_POINTS = 100;
/** Tracks are simplified to at most this many points, each a marker while the route is drawn. */
export const MAX_TRACK_POINTS = 500;

/** Rounded positions without consecutive repeats, which would make legs of no length. */
const cleanPoints = (points: readonly LngLat[]) => withoutRepeats(points.map(roundLngLat));

/**
 * Routes and waypoints from a GPX file. A GPX route keeps its points and is routed with
 * `profile`; a track, and a route of more than MAX_ROUTED_POINTS, is simplified to at most
 * MAX_TRACK_POINTS joined by straight lines, so that it keeps its shape. Unnamed entries
 * are named after the file.
 */
export function gpxToRouteData(
  gpx: GpxContent,
  options: { fileName: string; profile: Profile; existing: readonly Route[]; newId: () => string },
): RouteData {
  const lines = [
    ...gpx.routes.map((r) => ({ ...r, routed: r.points.length <= MAX_ROUTED_POINTS })),
    ...gpx.tracks.map((t) => ({ ...t, routed: false })),
  ].filter((l) => l.points.length > 0);
  const routes: Route[] = [];
  lines.forEach((line, i) => {
    const points = cleanPoints(line.routed ? line.points : simplifyToCount(line.points, MAX_TRACK_POINTS));
    routes.push({
      id: options.newId(),
      name: line.name ?? (lines.length === 1 ? options.fileName : `${options.fileName} ${i + 1}`),
      profile: options.profile,
      color: nextRouteColor([...options.existing, ...routes]),
      points: points.map((lngLat, j) => ({ id: options.newId(), lngLat, ...(!line.routed && j > 0 && { straight: true }) })),
      legs: {},
    });
  });
  const waypoints = gpx.waypoints.map((w, i) => ({
    id: options.newId(),
    lngLat: roundLngLat(w.lngLat),
    name: w.name ?? `Waypoint ${i + 1}`,
    ...(w.description && { description: w.description }),
  }));
  return { routes, waypoints };
}
