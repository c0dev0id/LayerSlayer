import { createEffect, createRoot, createSignal } from 'solid-js';
import type { LayerSource } from '../model/layer';
import { loadStyle } from '../services/style';
import { loadFile } from '../state/files';
import { state } from '../state/store';
import { errorMessage, reportLayerError } from '../state/ui';
import type { Assets } from './compose';

/** What a source needs loaded before it can be drawn, as a key that changes when that changes. */
function assetKey(source: LayerSource): string | undefined {
  if (source.type === 'style') return `style:${source.url}`;
  if ((source.type === 'geojson' || source.type === 'image') && 'file' in source.data) return `file:${source.data.file}`;
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

async function load(source: LayerSource): Promise<Assets> {
  if (source.type === 'style') return { style: await loadStyle(source.url) };
  if ((source.type === 'geojson' || source.type === 'image') && 'file' in source.data) {
    return { url: URL.createObjectURL(await loadFile(source.data.file)) };
  }
  return {};
}

function release(entry: Entry): void {
  if (entry.assets?.url) URL.revokeObjectURL(entry.assets.url);
}

createRoot(() => {
  createEffect(() => {
    const present = new Set<string>();
    for (const layer of state.layers) {
      const key = assetKey(layer.source);
      if (!key) continue;
      present.add(layer.id);
      if (entries.get(layer.id)?.key === key) continue;
      const previous = entries.get(layer.id);
      if (previous) release(previous);
      const entry: Entry = { key };
      entries.set(layer.id, entry);
      const id = layer.id;
      load(layer.source).then(
        (loaded) => {
          if (entries.get(id) !== entry) return release({ key, assets: loaded });
          entry.assets = loaded;
          setVersion((v) => v + 1);
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
