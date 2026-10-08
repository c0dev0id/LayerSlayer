import { mapIcon, type IconSet, type MapIcon } from '../model/icon';

/**
 * The icon sets layers and waypoints can be drawn with: Maki and Temaki, made for maps and
 * named after OpenStreetMap's features (CC0), and Material Design Icons for everything else
 * (Apache 2.0). Each is a chunk of its own, built from its package by tools/iconSets.ts.
 */

/** Loads each set, map sets first. */
export const ICON_SETS: readonly (() => Promise<IconSet>)[] = [
  () => import('virtual:icons/maki').then((m) => m.default),
  () => import('virtual:icons/temaki').then((m) => m.default),
  () => import('virtual:icons/mdi').then((m) => m.default),
];

/** A set's icons with the words they are found by: their names in words and the set's keywords. */
const indexes = new WeakMap<IconSet, { text: string; icon: MapIcon }[]>();

function index(set: IconSet): { text: string; icon: MapIcon }[] {
  let entries = indexes.get(set);
  if (!entries) {
    entries = Object.keys(set.icons).map((name) => ({
      text: `${name.replace(/[-_]/g, ' ')} ${set.icons[name]!.keywords ?? ''}`.toLowerCase(),
      icon: mapIcon(set, name),
    }));
    indexes.set(set, entries);
  }
  return entries;
}

/**
 * Icons whose name or keywords contain every word of the search, in the order of the sets,
 * at most `limit` of them, and how many match in all.
 */
export function searchIcons(sets: readonly IconSet[], query: string, limit: number): { icons: MapIcon[]; total: number } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const icons: MapIcon[] = [];
  let total = 0;
  for (const set of sets) {
    for (const { text, icon } of index(set)) {
      if (!words.every((w) => text.includes(w))) continue;
      total++;
      if (icons.length < limit) icons.push(icon);
    }
  }
  return { icons, total };
}
