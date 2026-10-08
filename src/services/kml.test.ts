import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { kmlPlacemarks, kmzDocument } from './kml';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark><name>Hut</name><description>Water</description><Point><coordinates>11.5,48.1,0</coordinates></Point></Placemark>
    <Folder>
      <name>Tour</name>
      <Placemark><name>Path</name><LineString><coordinates>11.5,48.1 11.6,48.2</coordinates></LineString></Placemark>
      <Placemark><name>Lake</name><Polygon><outerBoundaryIs><LinearRing><coordinates>1,1 2,1 2,2 1,1</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Folder>
    <Placemark><name>Nowhere</name></Placemark>
    <GroundOverlay><name>Scan</name><Icon><href>scan.jpg</href></Icon><LatLonBox><north>2</north><south>1</south><east>2</east><west>1</west></LatLonBox></GroundOverlay>
  </Document>
</kml>`;

describe('kmlPlacemarks', () => {
  it('reads placemarks with geometries, in folders too', () => {
    const { features } = kmlPlacemarks(KML);
    expect(features.map((f) => [f.properties?.name, f.geometry.type])).toEqual([
      ['Hut', 'Point'],
      ['Path', 'LineString'],
      ['Lake', 'Polygon'],
    ]);
    expect(features[0]!.properties?.description).toBe('Water');
    expect(features[1]!.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [11.5, 48.1],
        [11.6, 48.2],
      ],
    });
  });

  it('turns away what is not KML', () => {
    expect(() => kmlPlacemarks('<gpx/>')).toThrow('not a KML file');
    expect(() => kmlPlacemarks('{"type":"FeatureCollection"}')).toThrow('not a KML file');
  });
});

describe('kmzDocument', () => {
  it('takes doc.kml from the archive, or its first KML file', () => {
    const archive = zipSync({ 'files/a.kml': strToU8('<kml>a</kml>'), 'doc.kml': strToU8('<kml>doc</kml>'), 'img.png': new Uint8Array(3) });
    expect(kmzDocument(archive)).toBe('<kml>doc</kml>');
    expect(kmzDocument(zipSync({ 'b.kml': strToU8('<kml>b</kml>'), 'a.kml': strToU8('<kml>a</kml>') }))).toBe('<kml>a</kml>');
    expect(() => kmzDocument(zipSync({ 'img.png': new Uint8Array(3) }))).toThrow('holds no KML document');
  });
});
