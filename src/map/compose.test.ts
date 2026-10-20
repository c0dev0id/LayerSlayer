import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { createLayer, type Bounds, type Layer, type LayerDraft } from '../model/layer';
import { DEFAULT_SCENE } from '../model/scene';
import {
  composeStyle,
  isDraped,
  prefixImage,
  rasterAdjustments,
  resolveWmtsTile,
  scaleOpacity,
  styleFont,
  BACKGROUND_STATE,
  HILLSHADE_SOURCE,
  MAP_BACKGROUND,
  TERRAIN_SOURCE,
  wmtsTileUrl,
  type Assets,
  type MapOptions,
} from './compose';

const layer = (draft: LayerDraft, patch: Partial<Layer> = {}, id = 'L'): Layer => ({ ...createLayer(draft, [], id), ...patch });

/** A valid composed style, with the layers above the background layer every style starts with. */
function compose(layers: Layer[], assets: Record<string, Assets> = {}, options: MapOptions = {}): StyleSpecification {
  const style = composeStyle(layers, new Map(Object.entries(assets)), options);
  expect(validateStyleMin(style)).toEqual([]);
  expect(style.layers[0]).toMatchObject({ id: 'map-background', type: 'background' });
  return { ...style, layers: style.layers.slice(1) };
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
      'raster-opacity': 1,
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

  it('raises the ground by its elevation in 3D and shades the bottom layer by its relief', () => {
    const xyz = (id: string) => layer({ name: id, source: { type: 'xyz', tiles: [`https://${id}/{z}/{x}/{y}.png`], scheme: 'xyz', tileSize: 256 } }, {}, id);
    expect(compose([xyz('A')])).not.toHaveProperty('terrain');
    // The ground is not limited to the focus area; its shading is, like the layers.
    const style = compose([xyz('A'), xyz('B')], {}, { terrain: DEFAULT_SCENE, focus: [8, 48, 9, 49] });
    expect(style.terrain).toEqual({ source: TERRAIN_SOURCE, exaggeration: 1 });
    expect(style.sources[TERRAIN_SOURCE]).toMatchObject({ type: 'raster-dem', encoding: 'terrarium', tileSize: 512 });
    expect(style.sources[TERRAIN_SOURCE]).not.toHaveProperty('bounds');
    expect(style.sources[HILLSHADE_SOURCE]).toEqual({ ...style.sources[TERRAIN_SOURCE], bounds: [8, 48, 9, 49] });
    expect(style.layers.map((l) => l.id)).toEqual(['A', 'terrain-hillshade', 'B']);
    expect(style.layers[1]).toMatchObject({ type: 'hillshade', source: HILLSHADE_SOURCE });
    // Without a bottom layer to lie on, the shading lies on the background.
    expect(compose([], {}, { terrain: DEFAULT_SCENE }).layers.map((l) => l.id)).toEqual(['terrain-hillshade']);
  });

  it('puts a day or night sky over 3D terrain and none over a flat map', () => {
    expect(compose([])).not.toHaveProperty('sky');
    const day = compose([], {}, { terrain: DEFAULT_SCENE }).sky!;
    const night = compose([], {}, { terrain: { ...DEFAULT_SCENE, sky: 'night' } }).sky!;
    expect(day['sky-color']).toBe('#88c6fc');
    expect(night['sky-color']).not.toBe(day['sky-color']);
    expect(night['fog-color']).not.toBe(day['fog-color']);
    // A focus area keeps the ground clear of fog, under the same sky.
    const focused = compose([], {}, { terrain: DEFAULT_SCENE, focus: [8, 48, 9, 49] }).sky!;
    expect(focused).toEqual({ ...day, 'fog-ground-blend': 1 });
  });

  it('draws the map on its background colour, white where unset, under every layer', () => {
    const xyz = layer({ name: 'x', source: { type: 'xyz', tiles: ['https://t/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } });
    // compose() checks that the background layer comes first; this checks its colour.
    const background = (options?: MapOptions) => composeStyle([xyz], new Map(), options).layers[0];
    expect(background({ background: '#1b2b44' })).toMatchObject({ paint: { 'background-color': '#1b2b44' } });
    expect(background()).toMatchObject({ paint: { 'background-color': MAP_BACKGROUND } });
    // The overlays read it from the style's global state.
    expect(composeStyle([xyz], new Map(), { background: '#1b2b44' }).state).toEqual({ [BACKGROUND_STATE]: { default: '#1b2b44' } });
  });

  it('shows one layer alone over the bottom layer, whatever its eye, the bottom one as its eye says', () => {
    const tiles = (id: string, visible: boolean) => layer({ name: id, source: { type: 'xyz', tiles: [`https://${id}.example/{z}/{x}/{y}.png`], scheme: 'xyz', tileSize: 256 } }, { visible }, id);
    const ids = (style: StyleSpecification) => style.layers.map((l) => l.id);
    const layers = [tiles('base', true), tiles('a', true), tiles('b', false)];
    expect(ids(compose(layers))).toEqual(['base', 'a']);
    expect(ids(compose(layers, {}, { only: 'b' }))).toEqual(['base', 'b']);
    expect(ids(compose(layers, {}, { only: 'a' }))).toEqual(['base', 'a']);
    expect(ids(compose([tiles('base', false), ...layers.slice(1)], {}, { only: 'a' }))).toEqual(['a']);
    expect(ids(compose([tiles('base', false), ...layers.slice(1)], {}, { only: 'base' }))).toEqual(['base']);
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

  it('asks a WMS for the time a layer is drawn at', () => {
    const style = compose([
      layer({
        name: 'w',
        source: {
          type: 'wms',
          url: 'https://w.example/wms',
          version: '1.3.0',
          layers: 'a',
          styles: '',
          format: 'image/png',
          crs: 'EPSG:3857',
          time: { extent: '1887/2024/P1Y', value: '1960' },
        },
      }, { cache: false }),
    ]);
    expect((style.sources.L as { tiles: string[] }).tiles[0]).toMatch(/&TIME=1960$/);
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


  it('draws lines and outlines at the width and with the dashes of the layer', () => {
    const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;
    const plain = compose([layer({ name: 'g', source })]);
    expect(plain.layers[1]!.paint).toEqual({ 'line-color': '#e8590c', 'line-width': 1.5, 'line-opacity': 1 });
    expect(plain.layers[2]!.paint).toEqual({ 'line-color': '#e8590c', 'line-width': 2.5, 'line-opacity': 1 });
    const dotted = compose([layer({ name: 'g', source }, { lineWidth: 4, lineDash: 'dotted' })]);
    expect(dotted.layers[1]!.paint).toMatchObject({ 'line-width': 4, 'line-dasharray': [0, 2] });
    expect(dotted.layers[2]!.paint).toMatchObject({ 'line-width': 4, 'line-dasharray': [0, 2] });
    expect(compose([layer({ name: 'g', source }, { lineDash: 'long-dashed' })]).layers[2]!.paint).toMatchObject({ 'line-width': 2.5, 'line-dasharray': [5, 4] });
  });

  it('marks points and areas with the layer icon on a disc of its colour', () => {
    const icon = { id: 'maki:fuel', size: [15, 15] as [number, number], paths: ['M0 0h15v15z'] };
    const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;
    const style = compose([layer({ name: 'g', source }, { icon, opacity: 0.8 })]);
    expect(style.layers.map((l) => l.id)).toEqual(['L/fill', 'L/outline', 'L/line', 'L/point', 'L/icon']);
    // The disc is tinted and ringed by paint properties, so a new colour does not lay out tiles again.
    expect(style.layers[3]).toMatchObject({
      type: 'symbol',
      layout: { 'icon-image': 'poi-disc', 'icon-size': 1, 'icon-allow-overlap': true },
      paint: { 'icon-color': '#e8590c', 'icon-halo-color': '#ffffff', 'icon-halo-width': 1.5, 'icon-opacity': 0.8 },
    });
    expect(style.layers[4]).toMatchObject({ type: 'symbol', layout: { 'icon-image': 'poi:maki:fuel:1' }, paint: { 'icon-opacity': 0.8 } });
    expect(JSON.stringify(style.layers[4])).toContain('Polygon');
    const larger = compose([layer({ name: 'g', source }, { icon, iconSize: 1.5 })]);
    expect(larger.layers[3]).toMatchObject({ layout: { 'icon-size': 1.5 }, paint: { 'icon-halo-width': 2.25 } });
    expect(larger.layers[4]).toMatchObject({ layout: { 'icon-image': 'poi:maki:fuel:1.5' } });
    // A size out of bounds, as a project file may hold, is drawn at the nearest bound.
    expect(compose([layer({ name: 'g', source }, { icon, iconSize: 9 })]).layers[4]).toMatchObject({ layout: { 'icon-image': 'poi:maki:fuel:3' } });
  });

  it('labels features with a property beside them, in OpenFreeMap fonts where no style brings fonts', () => {
    const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;
    const style = compose([layer({ name: 'g', source }, { label: 'name', opacity: 0.8 })]);
    expect(style.layers.map((l) => l.id)).toEqual(['L/fill', 'L/outline', 'L/line', 'L/point', 'L/line-label', 'L/label']);
    expect(style.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
    expect(style.layers[4]).toMatchObject({
      type: 'symbol',
      layout: { 'text-field': ['to-string', ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'line', 'text-offset': [0, -(0.5 + (5 + 2) / 12)] },
      paint: { 'text-halo-color': '#ffffff', 'text-opacity': 0.8 },
    });
    // Beside the dot, or beside a larger icon.
    expect(style.layers[5]!.layout).toMatchObject({ 'text-radial-offset': (5 + 1.5 + 3) / 12 });
    const icon = { id: 'maki:fuel', size: [15, 15] as [number, number], paths: ['M0 0h15v15z'] };
    const withIcon = compose([layer({ name: 'g', source }, { label: 'name', icon, iconSize: 2 })]);
    expect(withIcon.layers.find((l) => l.id === 'L/label')!.layout).toMatchObject({ 'text-radial-offset': (12.5 * 2 + 3) / 12 });
    expect(compose([layer({ name: 'g', source })])).not.toHaveProperty('glyphs');
  });

  it('leaves out the dots where they are switched off, writing labels on the points instead', () => {
    const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;
    const style = compose([layer({ name: 'g', source }, { label: 'name', dots: false })]);
    expect(style.layers.map((l) => l.id)).toEqual(['L/fill', 'L/outline', 'L/line', 'L/line-label', 'L/label']);
    const label = style.layers.find((l) => l.id === 'L/label')!.layout!;
    expect(label).not.toHaveProperty('text-variable-anchor');
    expect(label).not.toHaveProperty('text-radial-offset');
    // An icon marks the points all the same.
    const icon = { id: 'maki:fuel', size: [15, 15] as [number, number], paths: ['M0 0h15v15z'] };
    expect(compose([layer({ name: 'g', source }, { dots: false, icon })]).layers.map((l) => l.id)).toContain('L/icon');
  });

  it('draws labels in the layer\'s label style, keeping their distance in ems of the text', () => {
    const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;
    const labelStyle = { color: '#0000ff', size: 16, outlineColor: '#000000', outlineWidth: 3 };
    const style = compose([layer({ name: 'g', source }, { label: 'name', labelStyle })]);
    const [line, point] = [style.layers.find((l) => l.id === 'L/line-label')!, style.layers.find((l) => l.id === 'L/label')!];
    expect(line.paint).toMatchObject({ 'text-color': '#0000ff', 'text-halo-color': '#000000', 'text-halo-width': 3 });
    expect(line.layout).toMatchObject({ 'text-size': 16, 'text-offset': [0, -(0.5 + (5 + 2) / 16)] });
    expect(point.layout).toMatchObject({ 'text-size': 16, 'text-radial-offset': (5 + 1.5 + 3) / 16 });
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

  it('sends no tiles through the tile cache while it is switched off', () => {
    const keeping = layer({ name: 'x', source: { type: 'xyz', tiles: ['https://t/{z}/{x}/{y}.png'], scheme: 'xyz', tileSize: 256 } }, {}, 'X');
    const style = compose([keeping], {}, { tileCache: false });
    expect((style.sources.X as { tiles: string[] }).tiles).toEqual(['https://t/{z}/{x}/{y}.png']);
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

    it('writes the labels of vector layers in a font of the style that brings the fonts', () => {
      const lettered: StyleSpecification = {
        ...base,
        layers: [
          ...base.layers,
          { id: 'towns', type: 'symbol', source: 'osm', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['literal', ['Open Sans Bold']] } },
          { id: 'roads-label', type: 'symbol', source: 'osm', 'source-layer': 'roads', layout: { 'text-field': '{name}', 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] } },
        ],
      };
      const labelled = layer({ name: 'g', source: { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } }, { label: 'name' }, 'G');
      const style = compose([styleLayer('A'), labelled], { A: { style: lettered } });
      expect(style.glyphs).toBe('https://s.example/fonts/{fontstack}/{range}.pbf');
      expect(style.layers.find((l) => l.id === 'G/label')!.layout).toMatchObject({ 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] });
    });

    it('shows or leaves out the buildings and labels of styles in 3D, and raises every symbol', () => {
      const built: StyleSpecification = {
        ...base,
        layers: [...base.layers, { id: 'houses', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building', paint: { 'fill-extrusion-height': 10 } }],
      };
      const labelled = layer({ name: 'g', source: { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } }, { label: 'name' }, 'G');
      const ids = (options: MapOptions) => compose([styleLayer('A'), labelled], { A: { style: built } }, options).layers.map((l) => l.id);
      const all = ['A/bg', 'A/roads', 'A/pois', 'A/houses', 'G/fill', 'G/outline', 'G/line', 'G/point', 'G/line-label', 'G/label'];
      // A flat map shows each style as it is, whatever the scene would say in 3D.
      expect(ids({})).toEqual(all);
      expect(ids({ terrain: DEFAULT_SCENE })).toEqual([...all.slice(0, 4), 'terrain-hillshade', ...all.slice(4)]);
      const hidden = ids({ terrain: { ...DEFAULT_SCENE, buildings: false, labels: false } });
      // A layer's own labels stay: they were chosen for it.
      expect(hidden).toEqual(['A/bg', 'A/roads', 'terrain-hillshade', 'G/fill', 'G/outline', 'G/line', 'G/point', 'G/line-label', 'G/label']);
      const raised = compose([styleLayer('A'), labelled], { A: { style: built } }, { terrain: { ...DEFAULT_SCENE, symbolDistance: 40 } }).layers;
      const offsets = raised.map((l) => [l.id, (l.layout as Record<string, unknown> | undefined)?.['symbol-height-offset']]).filter(([, offset]) => offset !== undefined);
      expect(offsets).toEqual([
        ['A/pois', 40],
        ['G/line-label', 40],
        ['G/label', 40],
      ]);
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

  it('limits every layer to the area, the bottom one too', () => {
    const style = compose([xyz('A'), xyz('B'), xyz('C', [8.5, 40, 20, 48.5])], {}, { focus });
    expect(style.sources.A).toMatchObject({ bounds: focus });
    expect(style.sources.B).toMatchObject({ bounds: focus });
    expect(style.sources.C).toMatchObject({ bounds: [8.5, 48, 9, 48.5] });
  });

  it('leaves out layers whose bounds lie outside the area', () => {
    const style = compose([xyz('A', [0, 0, 1, 1]), xyz('B', [0, 0, 1, 1]), xyz('C', [8, 48, 8.5, 48.5])], {}, { focus });
    expect(Object.keys(style.sources)).toEqual(['C']);
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
      { focus },
    );
    expect(style.sources.F).toMatchObject({ bounds: focus });
    expect(style.sources['S/tiles']).toMatchObject({ bounds: focus });
    expect(style.sources['S/dem']).toMatchObject({ bounds: [8.5, 48, 9, 49] });
    expect(style.sources['S/points']).not.toHaveProperty('bounds');
  });
});

describe('styleFont', () => {
  const symbol = (font: unknown) => ({ id: String(Math.random()), type: 'symbol', source: 's', layout: { 'text-field': 'x', 'text-font': font } }) as never;
  const style = (...layers: never[]): StyleSpecification => ({ version: 8, sources: {}, layers });

  it('takes a regular font over bold ones, and the first where none is regular', () => {
    expect(styleFont(style(symbol(['Bold A']), symbol(['literal', ['Regular B']])))).toEqual(['Regular B']);
    expect(styleFont(style(symbol(['Bold A']), symbol(['Italic C'])))).toEqual(['Bold A']);
  });

  it('finds none where fonts are chosen by expressions', () => {
    expect(styleFont(style(symbol(['step', ['zoom'], ['literal', ['A']], 10, ['literal', ['B']]])))).toBeUndefined();
    expect(styleFont(style())).toBeUndefined();
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

describe('composeStyle in 3D', () => {
  const xyz = (id: string) => layer({ name: id, source: { type: 'xyz', tiles: [`https://${id}/{z}/{x}/{y}.png`], scheme: 'xyz', tileSize: 256 } }, {}, id);
  const points = (id: string) => layer({ name: id, source: { type: 'geojson', data: { url: `https://a.example/${id}.geojson` } } }, { label: 'name' }, id);
  /** Runs of layers MapLibre drapes over the ground, each one a texture per ground tile. */
  const runs = (style: StyleSpecification) => style.layers.filter((l, i) => isDraped(l) && !(i > 0 && isDraped(style.layers[i - 1]!))).length;
  const stack = [xyz('A'), points('P'), points('Q'), xyz('B'), points('R')];

  it('draws the points and labels of vector layers stacked on each other after all their areas and lines', () => {
    const style = compose(stack, {}, { terrain: DEFAULT_SCENE });
    expect(style.layers.map((l) => l.id)).toEqual([
      'A',
      'terrain-hillshade',
      ...['P', 'Q'].flatMap((id) => [`${id}/fill`, `${id}/outline`, `${id}/line`]),
      ...['P', 'Q'].flatMap((id) => [`${id}/point`, `${id}/line-label`, `${id}/label`]),
      // A raster above them still covers their points and labels.
      'B',
      ...['R/fill', 'R/outline', 'R/line', 'R/point', 'R/line-label', 'R/label'],
    ]);
    expect(runs(style)).toBe(2);
  });

  it('keeps each layer whole on a flat map', () => {
    const style = compose(stack);
    expect(style.layers.slice(1, 7).map((l) => l.id)).toEqual(['P/fill', 'P/outline', 'P/line', 'P/point', 'P/line-label', 'P/label']);
    expect(runs(style)).toBe(3);
  });
});
