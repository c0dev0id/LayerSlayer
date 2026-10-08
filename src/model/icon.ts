/**
 * An icon as layers and waypoints keep it: which one (`set:name`) and its shape, so that
 * drawing it needs no icon set loaded.
 */
export interface MapIcon {
  id: string;
  /** Width and height of its viewBox. */
  size: [number, number];
  /** SVG path data, each filled. */
  paths: string[];
}

/** An icon set as the build makes it from its package (tools/iconSets.ts). */
export interface IconSet {
  id: string;
  name: string;
  /** Width and height of the viewBox of most of its icons. */
  size: number;
  icons: Record<string, { paths: string[]; size?: [number, number]; keywords?: string }>;
}

/** The icon `name` of a set, as layers and waypoints keep it. */
export function mapIcon(set: IconSet, name: string): MapIcon {
  const icon = set.icons[name];
  if (!icon) throw new Error(`There is no icon ${set.id}:${name}.`);
  return { id: `${set.id}:${name}`, size: icon.size ?? [set.size, set.size], paths: icon.paths };
}
