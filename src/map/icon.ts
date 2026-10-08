/** An icon for the map's addImage, drawn at `pixelRatio` device pixels per CSS pixel. */
export interface Icon {
  image: ImageData | ImageBitmap;
  pixelRatio: number;
}

/** Device pixels per CSS pixel that icons are drawn at. */
export function iconPixelRatio(): number {
  return Math.min(2, globalThis.devicePixelRatio || 1);
}
