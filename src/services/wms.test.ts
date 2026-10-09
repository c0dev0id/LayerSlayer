import { describe, expect, it } from 'vitest';
import wms111 from './fixtures/wms111-terrestris.xml?raw';
import rlpHistoric from './fixtures/wms130-rlp-hktk25.xml?raw';
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

  it('reads the time dimension a layer has or inherits, with its default', () => {
    const caps = (version: string, dimension: string) => `<?xml version="1.0"?>
      <WMS_Capabilities version="${version}" xmlns:xlink="http://www.w3.org/1999/xlink">
        <Service><Title>Test</Title></Service>
        <Capability>
          <Request><GetMap><Format>image/png</Format></GetMap></Request>
          <Layer><Name>root</Name><Title>Root</Title><CRS>EPSG:3857</CRS><SRS>EPSG:3857</SRS>${dimension}
            <Layer><Name>a</Name><Title>A</Title></Layer>
          </Layer>
          <Layer><Name>b</Name><Title>B</Title><CRS>EPSG:3857</CRS></Layer>
        </Capability>
      </WMS_Capabilities>`.replace(/WMS_Capabilities/g, version === '1.3.0' ? 'WMS_Capabilities' : 'WMT_MS_Capabilities');
    const times = (info: ReturnType<typeof parseWms>) => info.offers.map((o) => (o.draft?.source.type === 'wms' ? o.draft.source.time : 'none'));

    const v130 = parseWms(caps('1.3.0', '<Dimension name="time" units="ISO8601" default="2024" nearestValue="0">1887/2024/P1Y</Dimension>'), 'https://w.example');
    expect(times(v130)).toEqual([{ extent: '1887/2024/P1Y', value: '2024' }, { extent: '1887/2024/P1Y', value: '2024' }, undefined]);

    const v111 = parseWms(caps('1.1.1', '<Dimension name="TIME" units="ISO8601"/><Extent name="TIME">1936,1945</Extent>'), 'https://w.example');
    expect(times(v111)[0]).toEqual({ extent: '1936,1945', value: '1945' });

    const elevation = parseWms(caps('1.3.0', '<Dimension name="elevation" units="m">0,100</Dimension>'), 'https://w.example');
    expect(times(elevation)).toEqual([undefined, undefined, undefined]);
  });

  it('reads the editions of Rhineland-Palatinate\'s historic topographic maps', () => {
    const info = parseWms(rlpHistoric, 'https://geo4.service24.rlp.de/wms/hktk25.fcgi?SERVICE=WMS&REQUEST=GetCapabilities');
    const tk25 = info.offers.find((o) => o.name === 'rp_hktk25')?.draft?.source;
    expect(tk25).toMatchObject({ type: 'wms', crs: 'EPSG:3857', time: { extent: '1887/2024/P1Y', value: '2024' } });
  });
});
