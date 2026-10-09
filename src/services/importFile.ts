import { cornersBounds, geojsonBounds } from '../geo/bounds';
import type { FileResource, LayerDraft } from '../model/layer';
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

/** The kinds of file a layer is imported from, by extension and media type; GeoJSON is the fallback, so last. */
const FILE_KINDS = {
  pdf: { extensions: ['pdf'], types: ['application/pdf'] },
  gpx: { extensions: ['gpx'], types: ['application/gpx+xml'] },
  kml: { extensions: ['kml'], types: ['application/vnd.google-earth.kml+xml'] },
  kmz: { extensions: ['kmz'], types: ['application/vnd.google-earth.kmz'] },
  geojson: { extensions: ['geojson', 'json'], types: ['application/geo+json', 'application/json'] },
} satisfies Record<string, { extensions: string[]; types: string[] }>;

type FileKind = keyof typeof FILE_KINDS;

/** What the file chooser offers. */
export const IMPORT_ACCEPT = Object.values(FILE_KINDS)
  .flatMap((kind) => [...kind.extensions.map((e) => `.${e}`), ...kind.types])
  .join(',');

/** A file's kind by its media type or extension; GeoJSON where neither says otherwise. */
function fileKind(blob: Blob, name: string): FileKind {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const kinds = Object.keys(FILE_KINDS) as FileKind[];
  return kinds.find((k) => FILE_KINDS[k].types.includes(blob.type) || FILE_KINDS[k].extensions.includes(extension)) ?? 'geojson';
}

/**
 * A layer from a file: GeoJSON is kept as it is, the tracks of a GPX file and the
 * placemarks of a KML or KMZ file as GeoJSON, a GeoPDF as the picture of its map area.
 */
export async function importFile(file: Blob, name: string): Promise<LayerDraft> {
  const title = fileName(name);
  const kind = fileKind(file, name);
  // A file chosen from disk says when it was changed; one fetched does not.
  const modified = file instanceof File ? new Date(file.lastModified).toISOString() : undefined;
  const stored = async (blob: Blob): Promise<FileResource> => ({ file: await storeFile(blob), name, ...(modified && { modified }) });
  if (kind === 'pdf') {
    const { blob, coordinates } = await renderGeoPdf(await file.arrayBuffer());
    const bounds = cornersBounds(coordinates);
    return { name: title, source: { type: 'image', data: await stored(blob), coordinates }, ...(bounds && { bounds }) };
  }
  const [geojson, blob] = await readFeatures(file, name, kind);
  const bounds = geojsonBounds(geojson);
  return { name: title, source: { type: 'geojson', data: await stored(blob) }, ...(bounds && { bounds }) };
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
async function readFeatures(file: Blob, name: string, kind: Exclude<FileKind, 'pdf'>): Promise<[GeoJSON.GeoJSON, Blob]> {
  if (kind === 'gpx') {
    return converted(gpxTracksGeoJson(await file.text()), `${name} holds no tracks; its routes and waypoints can be imported under Routes.`);
  }
  if (kind === 'kml' || kind === 'kmz') {
    const { kmlPlacemarks, kmzDocument } = await import('./kml');
    const text = kind === 'kmz' ? kmzDocument(new Uint8Array(await file.arrayBuffer())) : await file.text();
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
