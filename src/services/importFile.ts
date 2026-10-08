import { cornersBounds, geojsonBounds } from '../geo/bounds';
import type { LayerDraft } from '../model/layer';
import { storeFile } from '../state/files';
import { fetchResource } from '../state/net';
import { renderGeoPdf } from './geopdf';
import { gpxTracksGeoJson } from './gpx';
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

function isKml(blob: Blob, name: string): boolean {
  return blob.type === 'application/vnd.google-earth.kml+xml' || /\.kml$/i.test(name);
}

function isKmz(blob: Blob, name: string): boolean {
  return blob.type === 'application/vnd.google-earth.kmz' || /\.kmz$/i.test(name);
}

/**
 * A layer from a file: GeoJSON is kept as it is, the tracks of a GPX file and the
 * placemarks of a KML or KMZ file as GeoJSON, a GeoPDF as the picture of its map area.
 */
export async function importFile(file: Blob, name: string): Promise<LayerDraft> {
  const title = fileName(name);
  if (isPdf(file, name)) {
    const { blob, coordinates } = await renderGeoPdf(await file.arrayBuffer());
    const key = await storeFile(blob);
    const bounds = cornersBounds(coordinates);
    return { name: title, source: { type: 'image', data: { file: key, name }, coordinates }, ...(bounds && { bounds }) };
  }
  const [geojson, blob] = await readFeatures(file, name);
  const key = await storeFile(blob);
  const bounds = geojsonBounds(geojson);
  return { name: title, source: { type: 'geojson', data: { file: key, name } }, ...(bounds && { bounds }) };
}

/** A GeoJSON file, kept as it is. */
async function readGeoJson(file: Blob, name: string): Promise<[GeoJSON.GeoJSON, Blob]> {
  let geojson: GeoJSON.GeoJSON;
  try {
    geojson = JSON.parse(await file.text()) as GeoJSON.GeoJSON;
  } catch {
    throw new Error(`${name} is neither a GeoPDF nor GeoJSON.`);
  }
  if (!GEOJSON_TYPES.has((geojson as { type?: string })?.type ?? '')) throw new Error(`${name} is not GeoJSON.`);
  return [geojson, file];
}

/** The features of a file, and what is kept of it: a GeoJSON file as it is, other formats converted to GeoJSON. */
async function readFeatures(file: Blob, name: string): Promise<[GeoJSON.GeoJSON, Blob]> {
  if (isGpx(file, name)) {
    return converted(gpxTracksGeoJson(await file.text()), `${name} holds no tracks; its routes and waypoints can be imported under Routes.`);
  }
  if (isKml(file, name) || isKmz(file, name)) {
    const { kmlPlacemarks, kmzDocument } = await import('./kml');
    const text = isKmz(file, name) ? kmzDocument(new Uint8Array(await file.arrayBuffer())) : await file.text();
    return converted(kmlPlacemarks(text), `${name} holds no placemarks with a geometry.`);
  }
  return readGeoJson(file, name);
}

function converted(features: GeoJSON.FeatureCollection, empty: string): [GeoJSON.GeoJSON, Blob] {
  if (features.features.length === 0) throw new Error(empty);
  return [features, new Blob([JSON.stringify(features)], { type: 'application/geo+json' })];
}

/** A GeoPDF fetched from an address, imported like a file. */
export async function importGeoPdfUrl(url: string): Promise<LayerDraft> {
  const blob = await (await fetchResource(url)).blob();
  return importFile(blob, url.split(/[?#]/)[0]!.split('/').pop() || 'map.pdf');
}
