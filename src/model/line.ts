/** Line widths in pixels: a vector layer's lines, a route's line. */
export const MIN_LINE_WIDTH = 0.5;
export const MAX_LINE_WIDTH = 10;

/** A line width within the bounds, whatever a project file says; `fallback` where unset or not a number. */
export function lineWidth(width: unknown, fallback: number): number {
  return typeof width === 'number' && Number.isFinite(width) ? Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, width)) : fallback;
}
