import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { storedFile } from '../model/layer';
import type { RouteData } from '../model/route';
import { parseRouteData } from './routes';
import { parseState, type AppState } from './store';

/**
 * A project file (.webmap) is a ZIP archive: `project.json` with the layers, the view, the
 * focus area, the hosts sent through the CORS proxy, the routes and the waypoints, and the
 * files the layers are made from as `files/<key>`. The proxy address is left out: it is a
 * setting of the browser and may carry an account key.
 */

/** The format's mark in project.json: the app's code name, kept when it was renamed Layer Slayer. */
const APP = 'webmap';
const NOT_A_PROJECT = 'This is not a Layer Slayer project file.';

export interface Project {
  state: AppState;
  routes: RouteData;
  /** The stored files of the layers, by key. */
  files: ReadonlyMap<string, Blob>;
}

/** The project as a file; the caller hands over the stored file of every layer that has one. */
export async function encodeProjectFile({ state, routes, files }: Project): Promise<Uint8Array<ArrayBuffer>> {
  const zip: Zippable = {};
  const types: Record<string, string> = {};
  for (const [key, blob] of files) {
    types[key] = blob.type;
    // Images are compressed already; GeoJSON shrinks to a fraction.
    zip[`files/${key}`] = [new Uint8Array(await blob.arrayBuffer()), { level: blob.type.startsWith('image/') ? 0 : 6 }];
  }
  const { proxy: _, ...settings } = state.settings;
  const project = { app: APP, ...state, settings, ...routes, files: types };
  zip['project.json'] = [strToU8(JSON.stringify(project, null, 2)), { level: 6 }];
  return zipSync(zip);
}

/**
 * Reads and checks a project file before anything is replaced. Its state has no proxy
 * address; layers, routes and waypoints of an unknown shape are dropped as when stored.
 */
export function decodeProjectFile(data: Uint8Array): Project {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    throw new Error(NOT_A_PROJECT);
  }
  const json = entries['project.json'];
  if (!json) throw new Error(`${NOT_A_PROJECT} It holds no project.json.`);
  const text = strFromU8(json);
  let raw: { app?: unknown; files?: unknown };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    throw new Error('The project.json of this file is not readable.');
  }
  if (raw?.app !== APP) throw new Error(NOT_A_PROJECT);
  const state = parseState(text);
  const types = typeof raw.files === 'object' && raw.files !== null ? (raw.files as Record<string, unknown>) : {};
  const files = new Map<string, Blob>();
  for (const layer of state.layers) {
    const key = storedFile(layer.source);
    if (!key) continue;
    const bytes = entries[`files/${key}`];
    if (!bytes) throw new Error(`The file of layer "${layer.name}" is missing from the project.`);
    const type = types[key];
    // unzipSync returns arrays of their own, so the Blob can take them without a copy.
    files.set(key, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: typeof type === 'string' ? type : '' }));
  }
  return { state, routes: parseRouteData(text), files };
}
