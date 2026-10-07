import { describe, expect, it } from 'vitest';
import basemapat from './fixtures/wmts-basemapat.xml?raw';
import topplus from './fixtures/wmts-topplus.xml?raw';
import { parseWmts } from './wmts';
import { wmtsTileUrl } from '../map/compose';
import type { WmtsSource } from '../model/layer';

const zooms = (n: number, name: (z: number) => string) =>
  Object.fromEntries(Array.from({ length: n }, (_, z) => [String(z), name(z)]));

describe('parseWmts', () => {
  it('reads basemap.at with matrices named by zoom', () => {
    const info = parseWmts(basemapat, 'https://mapsneu.wien.gv.at/basemapneu/1.0.0/WMTSCapabilities.xml');
    const offer = info.offers.find((o) => o.name === 'geolandbasemap');
    const source = offer?.draft?.source as WmtsSource;
    expect(source.template).toBe(
      'https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{TileMatrix}/{TileRow}/{TileCol}.png',
    );
    expect(source.tileSize).toBe(256);
    expect(source.matrices).toEqual(zooms(21, String));
    expect(wmtsTileUrl(source)).toBe('https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png');
    expect(offer?.draft?.bounds?.[0]).toBeGreaterThan(8);
  });

  it('reads TopPlusOpen, whose matrix names are padded, in its Web Mercator set', () => {
    const info = parseWmts(topplus, 'https://sgx.geodatenzentrum.de/wmts_topplus_open/1.0.0/WMTSCapabilities.xml');
    const offer = info.offers.find((o) => o.name === 'web');
    const source = offer?.draft?.source as WmtsSource;
    expect(source.template).toBe(
      'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{TileMatrix}/{TileRow}/{TileCol}.png',
    );
    expect(source.matrices).toEqual(zooms(19, (z) => String(z).padStart(2, '0')));
    expect(wmtsTileUrl(source).startsWith('wmts-matrix://')).toBe(true);
  });

  it('builds a KVP template, fills dimensions and honours matrix limits', () => {
    const xml = `<?xml version="1.0"?>
      <Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"
          xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0.0">
        <ows:OperationsMetadata><ows:Operation name="GetTile"><ows:DCP><ows:HTTP>
          <ows:Get xlink:href="https://t.example/wmts?"><ows:Constraint name="GetEncoding"><ows:AllowedValues><ows:Value>KVP</ows:Value></ows:AllowedValues></ows:Constraint></ows:Get>
        </ows:HTTP></ows:DCP></ows:Operation></ows:OperationsMetadata>
        <Contents>
          <Layer>
            <ows:Title>Radar</ows:Title><ows:Identifier>radar</ows:Identifier>
            <Style isDefault="true"><ows:Identifier>rain</ows:Identifier></Style>
            <Format>image/jpeg</Format><Format>image/png</Format>
            <Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-10-07</Default></Dimension>
            <TileMatrixSetLink><TileMatrixSet>utm</TileMatrixSet></TileMatrixSetLink>
            <TileMatrixSetLink><TileMatrixSet>pm</TileMatrixSet>
              <TileMatrixSetLimits><TileMatrixLimits><TileMatrix>m1</TileMatrix></TileMatrixLimits></TileMatrixSetLimits>
            </TileMatrixSetLink>
          </Layer>
          <Layer>
            <ows:Title>Local</ows:Title><ows:Identifier>local</ows:Identifier>
            <TileMatrixSetLink><TileMatrixSet>utm</TileMatrixSet></TileMatrixSetLink>
          </Layer>
          <TileMatrixSet><ows:Identifier>pm</ows:Identifier><ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
            <TileMatrix><ows:Identifier>m0</ows:Identifier><ScaleDenominator>559082264.0287178</ScaleDenominator>
              <TopLeftCorner>-20037508.34 20037508.34</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight>
              <MatrixWidth>1</MatrixWidth><MatrixHeight>1</MatrixHeight></TileMatrix>
            <TileMatrix><ows:Identifier>m1</ows:Identifier><ScaleDenominator>279541132.0143589</ScaleDenominator>
              <TopLeftCorner>-20037508.34 20037508.34</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight>
              <MatrixWidth>2</MatrixWidth><MatrixHeight>2</MatrixHeight></TileMatrix>
          </TileMatrixSet>
          <TileMatrixSet><ows:Identifier>utm</ows:Identifier><ows:SupportedCRS>EPSG:25832</ows:SupportedCRS></TileMatrixSet>
        </Contents>
      </Capabilities>`;
    const info = parseWmts(xml, 'https://t.example/wmts?REQUEST=GetCapabilities');
    const source = info.offers[0]!.draft!.source as WmtsSource;
    expect(source.template).toBe(
      'https://t.example/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=radar&STYLE=rain&FORMAT=image/png' +
        '&TILEMATRIXSET=pm&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}',
    );
    expect(source.matrices).toEqual({ '1': 'm1' });
    expect(info.offers[1]!.reason).toBe('No tile matrix set in Web Mercator (has utm).');
  });

  it('fills dimensions in RESTful templates', () => {
    const xml = `<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"><Contents>
      <Layer><ows:Identifier>a</ows:Identifier>
        <Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-10-07</Default></Dimension>
        <TileMatrixSetLink><TileMatrixSet>pm</TileMatrixSet></TileMatrixSetLink>
        <ResourceURL format="image/png" resourceType="tile" template="https://t.example/{Time}/{tilematrix}/{tilerow}/{tilecol}.png"/>
      </Layer>
      <TileMatrixSet><ows:Identifier>pm</ows:Identifier><ows:SupportedCRS>EPSG:3857</ows:SupportedCRS>
        <TileMatrix><ows:Identifier>0</ows:Identifier><ScaleDenominator>279541132.0143589</ScaleDenominator>
          <TopLeftCorner>-20037508.342789 20037508.342789</TopLeftCorner><TileWidth>512</TileWidth><TileHeight>512</TileHeight></TileMatrix>
      </TileMatrixSet></Contents></Capabilities>`;
    const source = parseWmts(xml, 'x').offers[0]!.draft!.source as WmtsSource;
    expect(source.template).toBe('https://t.example/2026-10-07/{TileMatrix}/{TileRow}/{TileCol}.png');
    expect(source.tileSize).toBe(512);
    expect(source.matrices).toEqual({ '0': '0' });
  });
});
