import { createEffect, createRoot, createSignal } from 'solid-js';
import { storedFile, type Layer } from '../model/layer';
import { loadSymbology } from './arcgisIcons';
import { loadStyle } from '../services/style';
import { loadFile } from '../state/files';
import { state } from '../state/store';
import { errorMessage, reportLayerError } from '../state/ui';
import type { Assets } from './compose';

/** What a layer needs loaded before it can be drawn as set, as a key that changes when that changes. */
function assetKey({ source, ownStyle }: Layer): string | undefined {
  if (source.type === 'style') return `style:${source.url}`;
  const file = storedFile(source);
  if (file) return `file:${file}`;
  if (source.type === 'arcgis-features' && ownStyle) return `symbols:${source.url}`;
  return undefined;
}

interface Entry {
  key: string;
  assets?: Assets;
}

const entries = new Map<string, Entry>();
const [version, setVersion] = createSignal(0);

/** Loaded assets by layer id; reading it tracks their arrival. */
export function assets(): ReadonlyMap<string, Assets> {
  version();
  const loaded = new Map<string, Assets>();
  for (const [id, entry] of entries) if (entry.assets) loaded.set(id, entry.assets);
  return loaded;
}

async function load({ id, source }: Layer): Promise<Assets> {
  if (source.type === 'style') return { style: await loadStyle(source.url) };
  if (source.type === 'arcgis-features') return loadSymbology(source, `${id}:`);
  const file = storedFile(source);
  return file ? { url: URL.createObjectURL(await loadFile(file)) } : {};
}

function release(entry: Entry): void {
  if (entry.assets?.url) URL.revokeObjectURL(entry.assets.url);
}

createRoot(() => {
  createEffect(() => {
    const present = new Set<string>();
    for (const layer of state.layers) {
      const key = assetKey(layer);
      if (!key) continue;
      present.add(layer.id);
      if (entries.get(layer.id)?.key === key) continue;
      // What the layer had stays drawn until its replacement has loaded: the map may read
      // a released file address again before it gets the new one.
      const previous = entries.get(layer.id);
      const entry: Entry = { key, ...(previous?.assets && { assets: previous.assets }) };
      entries.set(layer.id, entry);
      const id = layer.id;
      load(layer).then(
        (loaded) => {
          if (entries.get(id) !== entry) return release({ key, assets: loaded });
          entry.assets = loaded;
          setVersion((v) => v + 1);
          if (previous) release(previous);
        },
        (error: unknown) => reportLayerError(id, errorMessage(error)),
      );
    }
    for (const [id, entry] of entries) {
      if (!present.has(id)) {
        release(entry);
        entries.delete(id);
      }
    }
  });
});
