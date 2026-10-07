import { describe, expect, it } from 'vitest';
import wms111 from './fixtures/wms111-terrestris.xml?raw';
import wms130 from './fixtures/wms130-terrestris.xml?raw';
import { parseWms } from './wms';

describe('parseWms', () => {
  it('reads a 1.3.0 service', () => {
    const info = parseWms(wms130, 'https://ows.terrestris.de/osm/service?SERVICE=WMS&REQUEST=GetCapabilities');
    expect(info.title).toBe('OpenStreetMap WMS');
    const osm = info.offers.find((o) => o.name === 'OSM-WMS');
    expect(osm?.draft?.source).toEqual({
      type: 'wms',
      url: expect.stringMatching(/^https?:\/\/ows\.terrestris\.de\/osm\/service/),
      version: '1.3.0',
      layers: 'OSM-WMS',
      styles: '',
      format: 'image/png',
      crs: 'EPSG:3857',
    });
    expect(osm?.draft?.bounds).toEqual([-180, -85.0511287798, 180, 85.0511287798]);
  });

  it('reads a 1.1.1 service the same way', () => {
    const info = parseWms(wms111, 'https://ows.terrestris.de/osm/service');
    const osm = info.offers.find((o) => o.name === 'OSM-WMS');
    expect(osm?.draft?.source).toMatchObject({ version: '1.1.1', crs: 'EPSG:3857', layers: 'OSM-WMS' });
    expect(osm?.draft?.bounds?.[0]).toBe(-180);
  });

  it('inherits CRS, bounds and scale limits from parent layers and refuses layers without Web Mercator', () => {
    const xml = `<?xml version="1.0"?>
      <WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
        <Service><Title>Test</Title></Service>
        <Capability>
          <Request><GetMap><Format>image/jpeg</Format><Format>image/png</Format>
            <DCPType><HTTP><Get><OnlineResource xlink:href="https://w.example/wms?"/></Get></HTTP></DCPType>
          </GetMap></Request>
          <Layer>
            <Title>Root</Title>
            <CRS>EPSG:25832</CRS><CRS>EPSG:3857</CRS>
            <EX_GeographicBoundingBox><westBoundLongitude>5</westBoundLongitude><eastBoundLongitude>15</eastBoundLongitude>
              <southBoundLatitude>47</southBoundLatitude><northBoundLatitude>55</northBoundLatitude></EX_GeographicBoundingBox>
            <Attribution><Title>© Test</Title></Attribution>
            <Layer><Name>a</Name><Title>A</Title><MinScaleDenominator>1000</MinScaleDenominator><MaxScaleDenominator>500000</MaxScaleDenominator></Layer>
          </Layer>
          <Layer><Name>b</Name><Title>B</Title><CRS>EPSG:4326</CRS></Layer>
        </Capability>
      </WMS_Capabilities>`;
    const info = parseWms(xml, 'https://w.example/caps');
    expect(info.offers.map((o) => [o.title, o.depth, !!o.draft])).toEqual([
      ['Root', 0, false],
      ['A', 1, true],
      ['B', 0, false],
    ]);
    const a = info.offers[1]!.draft!;
    expect(a.source).toMatchObject({ url: 'https://w.example/wms?', format: 'image/png' });
    expect(a.bounds).toEqual([5, 47, 15, 55]);
    expect(a.attribution).toBe('© Test');
    expect(a.minzoom).toBe(9.1);
    expect(a.maxzoom).toBe(18.1);
    expect(info.offers[2]!.reason).toMatch(/Web Mercator/);
  });

  it('rejects other documents', () => {
    expect(() => parseWms('<html/>', 'x')).toThrow(/not a WMS/);
  });
});
