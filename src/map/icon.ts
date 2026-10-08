/** An icon for the map's addImage, drawn at `pixelRatio` device pixels per CSS pixel. */
export interface Icon {
  image: ImageData | ImageBitmap;
  pixelRatio: number;
  /** A signed distance field, which the map tints with `icon-color`. */
  sdf?: boolean;
}

/** Device pixels per CSS pixel that icons are drawn at. */
export function iconPixelRatio(): number {
  return Math.min(2, globalThis.devicePixelRatio || 1);
}
