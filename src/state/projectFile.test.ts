import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createLayer } from '../model/layer';
import type { RouteData } from '../model/route';
import { decodeProjectFile, encodeProjectFile, type Project } from './projectFile';
import { defaultState } from './store';

const file = createLayer({ name: 'walk.kml', source: { type: 'geojson', data: { file: 'f1', name: 'walk.kml' } } }, [], 'g');
const routes: RouteData = {
  routes: [{ id: 'r', name: 'Tour', profile: 'bike', color: '#e8590c', points: [{ id: 'p', lngLat: [8, 49] }], legs: {} }],
  waypoints: [{ id: 'w', lngLat: [8.1, 49.1], name: 'Pass' }],
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

  it('leaves the proxy address out of the file', async () => {
    const json = strFromU8(unzipSync(await encodeProjectFile(project))['project.json']!);
    expect(json).not.toContain('secret');
  });

  it('turns away what is not a webmap project', () => {
    expect(() => decodeProjectFile(strToU8('hello'))).toThrow('This is not a webmap project file.');
    expect(() => decodeProjectFile(zipSync({ 'other.txt': strToU8('x') }))).toThrow(/no project.json/);
    expect(() => decodeProjectFile(zipSync({ 'project.json': strToU8('{"layers":[]}') }))).toThrow('This is not a webmap project file.');
  });

  it('turns away a project whose layer file is missing', () => {
    const json = JSON.stringify({ app: 'webmap', layers: [file], view: base.view });
    expect(() => decodeProjectFile(zipSync({ 'project.json': strToU8(json) }))).toThrow(/walk.kml/);
  });
});
