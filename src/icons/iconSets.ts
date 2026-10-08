import type { LayerIcon } from '../model/layer';

/**
 * The icon sets layers can be drawn with: Maki and Temaki, made for maps and named after
 * OpenStreetMap's features (CC0), and Material Design Icons for everything else (Apache
 * 2.0). Each is a chunk of its own, built from its package by tools/iconSets.ts and loaded
 * when first needed.
 */

export interface IconSet {
  id: string;
  name: string;
  /** Width and height of the viewBox of most of its icons. */
  size: number;
  icons: Record<string, { paths: string[]; size?: [number, number]; keywords?: string }>;
}

const LOADERS: Record<string, () => Promise<{ default: IconSet }>> = {
  maki: () => import('virtual:icons/maki'),
  temaki: () => import('virtual:icons/temaki'),
  mdi: () => import('virtual:icons/mdi'),
};

/** The sets, map sets first, by id. */
export const ICON_SET_IDS = Object.keys(LOADERS);

const loaded = new Map<string, Promise<IconSet>>();

export function loadIconSet(id: string): Promise<IconSet> {
  let set = loaded.get(id);
  if (!set) {
    const load = LOADERS[id];
    if (!load) return Promise.reject(new Error(`There is no icon set ${id}.`));
    set = load().then((m) => m.default);
    set.catch(() => loaded.delete(id));
    loaded.set(id, set);
  }
  return set;
}

/** The icon `name` of a set, as a layer keeps it. */
export function layerIcon(set: IconSet, name: string): LayerIcon {
  const icon = set.icons[name];
  if (!icon) throw new Error(`There is no icon ${set.id}:${name}.`);
  return { id: `${set.id}:${name}`, size: icon.size ?? [set.size, set.size], paths: icon.paths };
}

/** The icon `set:name`, as a layer keeps it. */
export async function loadIcon(id: string): Promise<LayerIcon> {
  const [setId = '', name = ''] = id.split(':');
  return layerIcon(await loadIconSet(setId), name);
}

/** What an icon is found by: its name in words, and its set's keywords for it. */
const searchText = (set: IconSet, name: string) => `${name.replace(/[-_]/g, ' ')} ${set.icons[name]!.keywords ?? ''}`.toLowerCase();

/**
 * Icons whose name or keywords contain every word of the search, in the order of the sets,
 * at most `limit` of them, and how many match in all.
 */
export function searchIcons(sets: readonly IconSet[], query: string, limit: number): { icons: LayerIcon[]; total: number } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const icons: LayerIcon[] = [];
  let total = 0;
  for (const set of sets) {
    for (const name of Object.keys(set.icons)) {
      const text = searchText(set, name);
      if (!words.every((w) => text.includes(w))) continue;
      total++;
      if (icons.length < limit) icons.push(layerIcon(set, name));
    }
  }
  return { icons, total };
}
