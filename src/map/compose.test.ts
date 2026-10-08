import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { createLayer, type Bounds, type Layer, type LayerDraft } from '../model/layer';
import {
  composeStyle,
  prefixImage,
  rasterAdjustments,
  resolveWmtsTile,
  scaleOpacity,
  wmtsTileUrl,
  type Assets,
} from './compose';

const layer = (draft: LayerDraft, patch: Partial<Layer> = {}, id = 'L'): Layer => ({ ...createLayer(draft, [], id), ...patch });

function compose(layers: Layer[], assets: Record<string, Assets> = {}, focus?: Bounds, background?: string): StyleSpecification {
  const style = composeStyle(layers, new Map(Object.entries(assets)), focus, background);
  expect(validateStyleMin(style)).toEqual([]);
  return style;
}

describe('composeStyle', () => {
  it('draws XYZ tiles with the layer opacity, zoom range, bounds and attribution', () => {
    const style = compose([
      layer(
        {
          name: 'OSM',
          source: { type: 'xyz', tiles: ['https://t.example/{z}/{x}/{y}.png'], scheme: 'tms', tileSize: 256, maxzoom: 19 },
          bounds: [5, 45, 10, 48],
          attribution: '© OSM',
        },
        { opacity: 0.5, minzoom: 3, maxzoom: 18, cache: false },
      ),
    ]);
    expect(style.sources.L).toEqual({
      type: 'raster',
      tiles: ['https://t.example/{z}/{x}/{y}.png'],
      tileSize: 256,
      scheme: 'tms',
      maxzoom: 19,
      bounds: [5, 45, 10, 48],
      attribution: '© OSM',
    });
    expect(style.layers).toEqual([
      {
        id: 'L',
        type: 'raster',
        source: 'L',
        minzoom: 3,
        maxzoom: 18,
        paint: { 'raster-opacity': 0.5, 'raster-fade-duration': 0 },
      },
    ]);
  });

  it('adds the colour adjustments of a raster layer, within their ranges, leaving out defaults', () => {
    const style = compose([
      layer(
        { name: 'r', source: { type: 'xyz', tiles: ['https://t/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } },
        { adjust: { hue: 180, saturation: -1, contrast: 2, brightnessMin: 1, brightnessMax: 0 }, cache: false },
      ),
    ]);
    expect(style.layers[0]!.paint).toEqual({
      'raster-opacity': 0.5,
      'raster-fade-duration': 0,
      'raster-hue-rotate': 180,
      'raster-saturation': -1,
      'raster-contrast': 1,
      'raster-brightness-min': 1,
      'raster-brightness-max': 0,
    });
    expect(rasterAdjustments({ hue: 0, saturation: 0, contrast: 0, brightnessMin: 0, brightnessMax: 1 })).toEqual({});
    expect(rasterAdjustments(undefined)).toEqual({});
  });

  it('draws the map on its background colour, under every layer', () => {
    const xyz = layer({ name: 'x', source: { type: 'xyz', tiles: ['https://t/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } });
    expect(compose([xyz], {}, undefined, '#1b2b44').layers.slice(0, 2).map((l) => l.id)).toEqual(['map-background', 'L']);
    expect(compose([xyz], {}, undefined, '#1b2b44').layers[0]).toEqual({ id: 'map-background', type: 'background', paint: { 'background-color': '#1b2b44' } });
    expect(compose([xyz]).layers.map((l) => l.id)).toEqual(['L']);
  });

  it('leaves hidden layers and layers waiting for their file out', () => {
    const style = compose([
      layer({ name: 'a', source: { type: 'xyz', tiles: ['https://t/{z}/{x}/{y}'], scheme: 'xyz', tileSize: 256 } }, { visible: false }),
      layer({ name: 'b', source: { type: 'geojson', data: { file: 'f1', name: 'b.geojson' } } }, {}, 'B'),
    ]);
    expect(style.layers).toEqual([]);
    expect(style.sources).toEqual({});
  });

  it('requests WMS tiles in the version the service speaks', () => {
    const wms = (version: '1.1.1' | '1.3.0') =>
      compose([
        layer({
          name: 'w',
          source: { type: 'wms', url: 'https://w.example/wms?map=x', version, layers: 'a,b', styles: '', format: 'image/png', crs: 'EPSG:3857' },
        }, { cache: false }),
      ]).sources.L as { tiles: string[]; tileSize: number };
    expect(wms('1.3.0').tiles[0]).toBe(
      'https://w.example/wms?map=x&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=a,b&STYLES=&FORMAT=image/png' +
        '&TRANSPARENT=TRUE&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512',
    );
    expect(wms('1.1.1').tiles[0]).toContain('&SRS=EPSG:3857&');
    expect(wms('1.1.1').tileSize).toBe(512);
  });

  it('requests ArcGIS exports in Web Mercator', () => {
    const style = compose([
      layer({ name: 'a', source: { type: 'arcgis-map', url: 'https://a.example/rest/services/X/MapServer', layers: 'show:3', format: 'png32' } }, { cache: false }),
    ]);
    expect((style.sources.L as { tiles: string[] }).tiles[0]).toBe(
      'https://a.example/rest/services/X/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857' +
        '&size=512,512&format=png32&transparent=true&f=image&layers=show:3',
    );
  });

  it('draws GeoJSON in the layer colour, polygons with a light fill', () => {
    const style = compose([
      layer({ name: 'g', source: { type: 'geojson', data: { file: 'f1', name: 'g.geojson' } } }, { opacity: 0.8 }),
    ], { L: { url: 'blob:x' } });
    expect(style.sources.L).toEqual({ type: 'geojson', data: 'blob:x' });
    expect(style.layers.map((l) => l.id)).toEqual(['L/fill', 'L/outline', 'L/line', 'L/point']);
    expect(style.layers[0]!.paint).toEqual({ 'fill-color': '#e8590c', 'fill-opacity': 0.2 });
    expect(style.layers[3]!.paint).toMatchObject({ 'circle-opacity': 0.8 });
  });

  it('queries feature layers as vector tiles through the feature protocol', () => {
    const style = compose([
      layer({
        name: 'f',
        source: { type: 'arcgis-features', url: 'https://a.example/FeatureServer/0', geometry: 'polygon', maxRecordCount: 2000 },
        bounds: [-120, 30, -100, 45],
      }),
    ]);
    expect(style.sources.L).toMatchObject({ type: 'vector', maxzoom: 14 });
    expect(style.sources.L).not.toHaveProperty('bounds');
    expect(style.layers[0]).toMatchObject({ 'source-layer': 'features' });
  });

  it("draws an ArcGIS feature layer with its own symbology once loaded, and in its colour until then", () => {
    const features = layer(
      { name: 'f', source: { type: 'arcgis-features', url: 'https://a/FeatureServer/0', geometry: 'polygon', maxRecordCount: 2000 } },
      { ownStyle: true, opacity: 0.8 },
    );
    expect(compose([features]).layers.map((l) => l.id)).toEqual(['L/fill', 'L/outline', 'L/line', 'L/point']);
    const symbology = {
      opacity: 0.5,
      fillColor: ['match', ['to-string', ['get', 'KIND']], 'park', 'rgba(0,128,0,1)', 'rgba(0,0,0,0)'],
      lineColor: 'rgba(0,0,0,1)',
      lineWidth: 1,
      lineDash: ['literal', [3, 2]],
    };
    const style = compose([features], { L: { symbology } });
    expect(style.layers.map((l) => [l.id, l.type])).toEqual([
      ['L/fill', 'fill'],
      ['L/line', 'line'],
    ]);
    expect(style.layers[0]!.paint).toEqual({ 'fill-color': symbology.fillColor, 'fill-opacity': 0.4 });
    expect(style.layers[1]).toMatchObject({ 'source-layer': 'features', paint: { 'line-dasharray': ['literal', [3, 2]], 'line-opacity': 0.4 } });
    const points = compose([{ ...features, source: { ...features.source, geometry: 'point' } as never }], { L: { symbology: { opacity: 1, icon: 'L:0' } } });
    expect(points.layers).toEqual([
      expect.objectContaining({ type: 'symbol', layout: { 'icon-image': 'L:0', 'icon-allow-overlap': true, 'icon-ignore-placement': true } }),
    ]);
  });

  it('sends tiles through the tile cache unless the layer is set not to keep them', () => {
    const style = compose([
      layer({ name: 'x', source: { type: 'xyz', tiles: ['https://t/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } }, {}, 'X'),
      layer({ name: 'f', source: { type: 'arcgis-features', url: 'https://a/FeatureServer/0', geometry: 'point', maxRecordCount: 1000 } }, {}, 'F'),
      layer({ name: 'n', source: { type: 'xyz', tiles: ['https://n/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } }, { cache: false }, 'N'),
    ]);
    expect((style.sources.X as { tiles: string[] }).tiles).toEqual(['cache+https://t/{z}/{x}/{y}.png']);
    expect((style.sources.F as { tiles: string[] }).tiles[0]).toMatch(/^cache\+features:\/\//);
    expect((style.sources.N as { tiles: string[] }).tiles).toEqual(['https://n/{z}/{x}/{y}.png']);
  });

  it('draws one layer of a vector tile set in the layer colour', () => {
    const style = compose([
      layer(
        {
          name: 'roads',
          source: { type: 'vector-tiles', tiles: ['https://t/{z}/{x}/{y}.pbf'], layer: 'transportation', maxzoom: 14 },
        },
        { cache: false },
      ),
    ]);
    expect(style.sources.L).toEqual({ type: 'vector', tiles: ['https://t/{z}/{x}/{y}.pbf'], maxzoom: 14 });
    expect(style.layers.every((l) => 'source-layer' in l && l['source-layer'] === 'transportation')).toBe(true);
  });

  it('reads a COG through its protocol, colouring single-band data', () => {
    const image = compose([layer({ name: 'o', source: { type: 'cog', url: 'https://x/ortho.tif' } })]);
    expect(image.sources.L).toEqual({ type: 'raster', url: 'cog://https://x/ortho.tif', tileSize: 256 });
    const data = compose([layer({ name: 'd', source: { type: 'cog', url: 'https://x/dem.tif', ramp: { min: 120, max: 480 } } })]);
    expect((data.sources.L as { url: string }).url).toBe('cog://https://x/dem.tif#color:BrewerSpectral11,120,480,c-');
  });

  it('places a georeferenced image by its corners', () => {
    const coordinates: [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]];
    const style = compose(
      [layer({ name: 'i', source: { type: 'image', data: { file: 'f', name: 'map.pdf' }, coordinates: coordinates as never } })],
      { L: { url: 'blob:img' } },
    );
    expect(style.sources.L).toEqual({ type: 'image', url: 'blob:img', coordinates });
  });

  describe('style layers', () => {
    const base: StyleSpecification = {
      version: 8,
      glyphs: '/fonts/{fontstack}/{range}.pbf',
      sprite: 'sprites/base',
      sources: { osm: { type: 'vector', url: 'tiles.json' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#eee' } },
        { id: 'roads', type: 'line', source: 'osm', 'source-layer': 'roads', minzoom: 5, paint: { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 1] } },
        { id: 'pois', type: 'symbol', source: 'osm', 'source-layer': 'poi', maxzoom: 22, layout: { 'icon-image': ['get', 'icon'] } },
      ],
    };
    const styleLayer = (id: string, patch: Partial<Layer> = {}) =>
      layer({ name: id, source: { type: 'style', url: `https://s.example/styles/${id}.json` } }, patch, id);

    it('joins the style under prefixed ids with absolute URLs', () => {
      const style = compose([styleLayer('A')], { A: { style: base } });
      expect(style.glyphs).toBe('https://s.example/fonts/{fontstack}/{range}.pbf');
      expect(style.sprite).toEqual([{ id: 'default', url: 'https://s.example/styles/sprites/base' }]);
      expect(style.sources).toEqual({ 'A/osm': { type: 'vector', url: 'https://s.example/styles/tiles.json' } });
      expect(style.layers.map((l) => l.id)).toEqual(['A/bg', 'A/roads', 'A/pois']);
      expect(style.layers[1]).toMatchObject({ source: 'A/osm', minzoom: 5 });
    });

    it('scales every opacity and narrows the zoom ranges', () => {
      const style = compose([styleLayer('A', { opacity: 0.5, minzoom: 8, maxzoom: 20 })], { A: { style: base } });
      expect(style.layers[0]).toMatchObject({ minzoom: 8, maxzoom: 20, paint: { 'background-opacity': 0.5 } });
      expect(style.layers[1]!.paint).toEqual({ 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.25, 10, 0.5] });
      expect(style.layers[2]).toMatchObject({ minzoom: 8, maxzoom: 20, paint: { 'icon-opacity': 0.5, 'text-opacity': 0.5 } });
    });

    it('drops style layers outside the layer zoom range', () => {
      const style = compose([styleLayer('A', { maxzoom: 5 })], { A: { style: base } });
      expect(style.layers.map((l) => l.id)).toEqual(['A/bg', 'A/pois']);
    });

    it('adds the sprite of a second style under its layer id', () => {
      const other = { ...base, sprite: 'https://o.example/sprite' };
      const style = compose([styleLayer('A'), styleLayer('B')], { A: { style: base }, B: { style: other } });
      expect(style.sprite).toEqual([
        { id: 'default', url: 'https://s.example/styles/sprites/base' },
        { id: 'B', url: 'https://o.example/sprite' },
      ]);
      expect(style.layers.find((l) => l.id === 'A/pois')!.layout).toEqual({ 'icon-image': ['get', 'icon'] });
      expect(style.layers.find((l) => l.id === 'B/pois')!.layout).toEqual({ 'icon-image': ['concat', 'B:', ['get', 'icon']] });
    });

    it('shares the sprite of a style added twice', () => {
      const style = compose([styleLayer('A'), styleLayer('B')], { A: { style: base }, B: { style: base } });
      expect(style.sprite).toEqual([{ id: 'default', url: 'https://s.example/styles/sprites/base' }]);
      expect(style.layers.find((l) => l.id === 'B/pois')!.layout).toEqual({ 'icon-image': ['get', 'icon'] });
    });
  });
});

describe('composeStyle with a focus area', () => {
  const focus: Bounds = [8, 48, 9, 49];
  const xyz = (id: string, bounds?: Bounds) =>
    layer({ name: id, source: { type: 'xyz', tiles: [`https://${id}/{z}/{x}/{y}.png`], scheme: 'xyz', tileSize: 256 }, ...(bounds && { bounds }) }, {}, id);

  it('limits every layer but the bottom one to the area', () => {
    const style = compose([xyz('A'), xyz('B'), xyz('C', [8.5, 40, 20, 48.5])], {}, focus);
    expect(style.sources.A).not.toHaveProperty('bounds');
    expect(style.sources.B).toMatchObject({ bounds: focus });
    expect(style.sources.C).toMatchObject({ bounds: [8.5, 48, 9, 48.5] });
  });

  it('leaves out layers whose bounds lie outside the area, unless at the bottom', () => {
    const style = compose([xyz('A', [0, 0, 1, 1]), xyz('B', [0, 0, 1, 1])], {}, focus);
    expect(Object.keys(style.sources)).toEqual(['A']);
  });

  it('limits feature layers and the tiled sources of styles', () => {
    const style = compose(
      [
        xyz('A'),
        layer({ name: 'f', source: { type: 'ogc-features', url: 'https://o/collections/c/items', limit: 1000 } }, {}, 'F'),
        layer({ name: 's', source: { type: 'style', url: 'https://s/style.json' } }, {}, 'S'),
      ],
      {
        S: {
          style: {
            version: 8,
            sources: {
              tiles: { type: 'vector', url: 'tiles.json' },
              dem: { type: 'raster-dem', tiles: ['https://d/{z}/{x}/{y}.png'], bounds: [8.5, 0, 20, 60] },
              points: { type: 'geojson', data: 'points.geojson' },
            },
            layers: [],
          },
        },
      },
      focus,
    );
    expect(style.sources.F).toMatchObject({ bounds: focus });
    expect(style.sources['S/tiles']).toMatchObject({ bounds: focus });
    expect(style.sources['S/dem']).toMatchObject({ bounds: [8.5, 48, 9, 49] });
    expect(style.sources['S/points']).not.toHaveProperty('bounds');
  });
});

describe('scaleOpacity', () => {
  it('scales numbers, defaults and data expressions', () => {
    expect(scaleOpacity(undefined, 0.5)).toBe(0.5);
    expect(scaleOpacity(0.8, 0.5)).toBe(0.4);
    expect(scaleOpacity(['get', 'o'], 0.5)).toEqual(['*', ['get', 'o'], 0.5]);
  });

  it('scales the outputs of zoom expressions instead of wrapping them', () => {
    expect(scaleOpacity(['step', ['zoom'], 0, 10, 1], 0.5)).toEqual(['step', ['zoom'], 0, 10, 0.5]);
    expect(scaleOpacity(['interpolate', ['linear'], ['zoom'], 5, ['get', 'o'], 10, 1], 0.5)).toEqual([
      'interpolate', ['linear'], ['zoom'], 5, ['*', ['get', 'o'], 0.5], 10, 0.5,
    ]);
  });

  it('scales legacy functions', () => {
    expect(scaleOpacity({ base: 1, stops: [[5, 0.4], [10, 1]] }, 0.5)).toEqual({ base: 1, stops: [[5, 0.2], [10, 0.5]] });
  });
});

describe('prefixImage', () => {
  it('prefixes names, token strings and string expressions', () => {
    expect(prefixImage('park', 'S')).toBe('S:park');
    expect(prefixImage('{class}_11', 'S')).toBe('S:{class}_11');
    expect(prefixImage('', 'S')).toBe('');
    expect(prefixImage(['get', 'icon'], 'S')).toEqual(['concat', 'S:', ['get', 'icon']]);
  });

  it('prefixes inside image operators and zoom steps', () => {
    expect(prefixImage(['coalesce', ['image', 'a'], ['image', ['get', 'b']]], 'S')).toEqual([
      'coalesce', ['image', 'S:a'], ['image', ['concat', 'S:', ['get', 'b']]],
    ]);
    expect(prefixImage(['step', ['zoom'], 'a', 12, 'b'], 'S')).toEqual(['step', ['zoom'], 'S:a', 12, 'S:b']);
    expect(prefixImage({ stops: [[1, 'a']], default: 'b' }, 'S')).toEqual({ stops: [[1, 'S:a']], default: 'S:b' });
  });
});

describe('WMTS tiles', () => {
  const template = 'https://w.example/t/{TileMatrix}/{TileRow}/{TileCol}.png';

  it('uses {z} for matrices named by their zoom, with or without a prefix', () => {
    expect(wmtsTileUrl({ type: 'wmts', template, matrices: { '0': '0', '1': '1' }, tileSize: 256 })).toBe(
      'https://w.example/t/{z}/{y}/{x}.png',
    );
    expect(wmtsTileUrl({ type: 'wmts', template, matrices: { '3': 'EPSG:3857:3', '4': 'EPSG:3857:4' }, tileSize: 256 })).toBe(
      'https://w.example/t/EPSG:3857:{z}/{y}/{x}.png',
    );
  });

  it('looks other matrix names up per tile', () => {
    const url = wmtsTileUrl({ type: 'wmts', template, matrices: { '9': '09', '10': '10' }, tileSize: 256 });
    expect(url.startsWith('wmts-matrix://{z}/{x}/{y}?')).toBe(true);
    const tile = url.replace('{z}', '9').replace('{x}', '0').replace('{y}', '1');
    expect(resolveWmtsTile(tile)).toBe('https://w.example/t/09/1/0.png');
  });
});
