import { kml } from '@tmcw/togeojson';
import { strFromU8, unzipSync } from 'fflate';
import { parseXml } from './xml';

/**
 * The placemarks of a KML document as GeoJSON. Ground overlays (pictures placed by a box)
 * and placemarks without a geometry are left out; KML styles are not kept, the layer is
 * drawn in its own colour.
 */
export function kmlPlacemarks(text: string): GeoJSON.FeatureCollection {
  const root = parseXml(text, 'This is not a KML file.', 'kml');
  const { features } = kml(root.ownerDocument, { skipNullGeometry: true });
  return {
    type: 'FeatureCollection',
    features: features.filter((f): f is GeoJSON.Feature => f.geometry !== null && f.properties?.['@geometry-type'] !== 'groundoverlay'),
  };
}

/** The main KML document of a KMZ archive: doc.kml, or else the first KML file in it. */
export function kmzDocument(archive: Uint8Array): string {
  const files = unzipSync(archive, { filter: (file) => /\.kml$/i.test(file.name) });
  const name = 'doc.kml' in files ? 'doc.kml' : Object.keys(files).sort()[0];
  if (!name) throw new Error('The KMZ archive holds no KML document.');
  return strFromU8(files[name]!);
}
