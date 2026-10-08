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
