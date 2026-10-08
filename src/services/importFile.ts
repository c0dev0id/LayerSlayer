import { cornersBounds, geojsonBounds } from '../geo/bounds';
import type { LayerDraft } from '../model/layer';
import { storeFile } from '../state/files';
import { fetchResource } from '../state/net';
import { gpxTracksGeoJson } from '../routing/gpx';
import { renderGeoPdf } from './geopdf';
import { fileName } from './read';

const GEOJSON_TYPES = new Set([
  'FeatureCollection',
  'Feature',
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

function isPdf(blob: Blob, name: string): boolean {
  return blob.type === 'application/pdf' || /\.pdf$/i.test(name);
}

function isGpx(blob: Blob, name: string): boolean {
  return blob.type === 'application/gpx+xml' || /\.gpx$/i.test(name);
}

/**
 * A layer from a file: GeoJSON is kept as it is, the tracks of a GPX file as GeoJSON, a
 * GeoPDF as the picture of its map area.
 */
export async function importFile(file: Blob, name: string): Promise<LayerDraft> {
  const title = fileName(name);
  if (isGpx(file, name)) {
    const tracks = gpxTracksGeoJson(await file.text());
    if (tracks.features.length === 0) throw new Error(`${name} holds no tracks; its routes and waypoints can be imported under Routes.`);
    const key = await storeFile(new Blob([JSON.stringify(tracks)], { type: 'application/geo+json' }));
    const bounds = geojsonBounds(tracks);
    return { name: title, source: { type: 'geojson', data: { file: key, name } }, ...(bounds && { bounds }) };
  }
  if (isPdf(file, name)) {
    const { blob, coordinates } = await renderGeoPdf(await file.arrayBuffer());
    const key = await storeFile(blob);
    const bounds = cornersBounds(coordinates);
    return { name: title, source: { type: 'image', data: { file: key, name }, coordinates }, ...(bounds && { bounds }) };
  }
  let geojson: GeoJSON.GeoJSON;
  try {
    geojson = JSON.parse(await file.text()) as GeoJSON.GeoJSON;
  } catch {
    throw new Error(`${name} is neither a GeoPDF nor GeoJSON.`);
  }
  if (!GEOJSON_TYPES.has((geojson as { type?: string })?.type ?? '')) throw new Error(`${name} is not GeoJSON.`);
  const key = await storeFile(file);
  const bounds = geojsonBounds(geojson);
  return { name: title, source: { type: 'geojson', data: { file: key, name } }, ...(bounds && { bounds }) };
}

/** A GeoPDF fetched from an address, imported like a file. */
export async function importGeoPdfUrl(url: string): Promise<LayerDraft> {
  const blob = await (await fetchResource(url)).blob();
  return importFile(blob, url.split(/[?#]/)[0]!.split('/').pop() || 'map.pdf');
}
