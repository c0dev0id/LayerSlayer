import { unwrap } from 'solid-js/store';
import { storedFile } from '../model/layer';
import { stopDrawing, stopFocusDrawing } from './drawing';
import { collectFiles, loadFile, putFile } from './files';
import type { Project } from './projectFile';
import { replaceRouteData, routeData } from './routes';
import { replaceState, state } from './store';
import { map } from './ui';

/**
 * Saving everything to a project file and opening one in its place. The file format, and
 * fflate with it, loads when it is first needed.
 */

/** The project as a .webmap file, with the stored files of its layers. */
export async function saveProject(): Promise<Blob> {
  const current = unwrap(state);
  const files = new Map<string, Blob>();
  for (const layer of current.layers) {
    const key = storedFile(layer.source);
    if (!key) continue;
    const blob = await loadFile(key).catch(() => {
      throw new Error(`The file of layer "${layer.name}" is no longer stored in this browser.`);
    });
    files.set(key, blob);
  }
  const { encodeProjectFile } = await import('./projectFile');
  return new Blob([await encodeProjectFile({ state: current, routes: unwrap(routeData), files })], { type: 'application/zip' });
}

/** Reads and checks a project file; nothing is replaced yet. */
export async function readProject(file: Blob): Promise<Project> {
  const { decodeProjectFile } = await import('./projectFile');
  return decodeProjectFile(new Uint8Array(await file.arrayBuffer()));
}

/**
 * Makes the project the one in this browser: its files are stored first, so its layers
 * find them, then the state and routes are replaced, the files no layer uses are deleted
 * and the map moves to the project's view. Drawing ends.
 */
export async function openProject(project: Project): Promise<void> {
  stopDrawing();
  stopFocusDrawing();
  for (const [key, blob] of project.files) await putFile(key, blob);
  replaceState(project.state);
  replaceRouteData(project.routes);
  await collectFiles(new Set(project.files.keys()));
  const { center, zoom, bearing, pitch } = project.state.view;
  map()?.jumpTo({ center, zoom, bearing, pitch });
}
