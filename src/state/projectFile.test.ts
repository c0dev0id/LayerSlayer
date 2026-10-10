import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createLayer } from '../model/layer';
import type { RouteData } from '../model/route';
import { decodeProjectFile, encodeProjectFile, type Project } from './projectFile';
import { defaultState } from './store';

const file = createLayer({ name: 'walk.kml', source: { type: 'geojson', data: { file: 'f1', name: 'walk.kml' } } }, [], 'g');
const routes: RouteData = {
  routes: [{ id: 'r', name: 'Tour', profile: 'bike', color: '#e8590c', points: [{ id: 'p', lngLat: [8, 49] }], legs: {} }],
  waypoints: [{ id: 'w', routeId: 'r', lngLat: [8.1, 49.1], name: 'Pass' }],
};
const base = defaultState();
const project: Project = {
  state: {
    ...base,
    layers: [...base.layers, file],
    activeLayerId: 'g',
    settings: { proxy: 'https://proxy.example/?key=secret&url={url}', proxiedHosts: ['slow.example'] },
    focus: [
      [8, 49],
      [9, 49],
      [9, 50],
    ],
  },
  routes,
  files: new Map([['f1', new Blob(['{"type":"FeatureCollection","features":[]}'], { type: 'application/geo+json' })]]),
};

describe('project file', () => {
  it('round-trips layers, view, focus area, proxied hosts, routes and files', async () => {
    const read = decodeProjectFile(await encodeProjectFile(project));
    expect(read.state).toEqual({ ...project.state, settings: { proxy: '', proxiedHosts: ['slow.example'] } });
    expect(read.routes).toEqual(routes);
    const blob = read.files.get('f1')!;
    expect(blob.type).toBe('application/geo+json');
    expect(await blob.text()).toBe('{"type":"FeatureCollection","features":[]}');
  });

  it("leaves the proxy address and this browser's switches out of the file", async () => {
    const switched = { ...project, state: { ...project.state, settings: { ...project.state.settings, tileCacheOff: true, proxyOff: true } } };
    const json = strFromU8(unzipSync(await encodeProjectFile(switched))['project.json']!);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('tileCacheOff');
    expect(json).not.toContain('proxyOff');
  });

  it('turns away what is not a project file', () => {
    expect(() => decodeProjectFile(strToU8('hello'))).toThrow('This is not a Layer Slayer project file.');
    expect(() => decodeProjectFile(zipSync({ 'other.txt': strToU8('x') }))).toThrow(/no project.json/);
    expect(() => decodeProjectFile(zipSync({ 'project.json': strToU8('{"layers":[]}') }))).toThrow('This is not a Layer Slayer project file.');
  });

  it('marks the file as a Layer Slayer project', async () => {
    const json = JSON.parse(strFromU8(unzipSync(await encodeProjectFile(project))['project.json']!));
    expect(json.app).toBe('layerslayer');
  });

  it('opens .webmap files saved before the rename', async () => {
    const entries = unzipSync(await encodeProjectFile(project));
    const json = { ...JSON.parse(strFromU8(entries['project.json']!)), app: 'webmap' };
    const read = decodeProjectFile(zipSync({ ...entries, 'project.json': strToU8(JSON.stringify(json)) }));
    expect(read.state.layers).toEqual(project.state.layers);
    expect(read.routes).toEqual(routes);
    expect(await read.files.get('f1')!.text()).toBe('{"type":"FeatureCollection","features":[]}');
  });

  it('turns away a project whose layer file is missing', () => {
    const json = JSON.stringify({ app: 'layerslayer', layers: [file], view: base.view });
    expect(() => decodeProjectFile(zipSync({ 'project.json': strToU8(json) }))).toThrow(/walk.kml/);
  });
});
