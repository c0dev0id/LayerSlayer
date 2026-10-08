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

/** How many times its normal size an icon is drawn: a layer's icons, a route's waypoints. */
export const MIN_ICON_SIZE = 1;
export const MAX_ICON_SIZE = 3;

/** An icon size within the bounds, whatever a project file says; 1 where unset. */
export function iconSize(size: number | undefined): number {
  return Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, size ?? 1));
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
