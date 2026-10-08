import type { MapIcon } from '../model/icon';
import { iconPixelRatio, type Icon } from './icon';

/**
 * Layer icons on the map: a white icon on a disc of the layer's colour, ringed in white,
 * readable on any base map. The disc is one image for every layer, a signed distance field
 * the map tints with the layer's colour and rings with a white halo, so colour and opacity
 * stay paint properties. The icon on it is an image per icon and size, drawn at that size
 * so that larger icons stay sharp rather than scaled up.
 */

export const POI_DISC = 'poi-disc';
/** Width of the white ring around the disc, in CSS pixels at size 1. */
export const POI_RING = 1.5;

/** Diameter of the disc and of the icon on it, in CSS pixels at size 1. */
const DISC = 22;
const GLYPH = 13;
/** Distance field around the disc, room for the ring at any size. */
const SDF_BUFFER = 4;

/** The map image of an icon drawn `size` times its normal size. */
export function poiImageId(icon: MapIcon, size: number): string {
  return `poi:${icon.id}:${size}`;
}

/** The icon id and size a map image stands for, if it is a layer icon's. */
export function parsePoiImageId(id: string): { icon: string; size: number } | undefined {
  const [prefix, set, name, size] = id.split(':');
  return prefix === 'poi' && set && name && size ? { icon: `${set}:${name}`, size: Number(size) } : undefined;
}

/**
 * The disc as a signed distance field, one pixel per CSS pixel: MapLibre reads alpha 0.75
 * as the edge, and each pixel of distance as 1/8 of the alpha range, as in its glyphs.
 */
export function drawDisc(): Icon {
  const extent = DISC + 2 * SDF_BUFFER;
  const center = extent / 2;
  const data = new Uint8ClampedArray(extent * extent * 4);
  for (let y = 0; y < extent; y++) {
    for (let x = 0; x < extent; x++) {
      const inside = DISC / 2 - Math.hypot(x + 0.5 - center, y + 0.5 - center);
      data[(y * extent + x) * 4 + 3] = 255 * (0.75 + inside / 8);
    }
  }
  return { image: new ImageData(data, extent, extent), pixelRatio: 1, sdf: true };
}

/** An icon in white, `size` times its normal size: drawn at that many times the display's resolution, handed over at the display's. */
export function drawGlyph(icon: MapIcon, size: number): Icon {
  const pixelRatio = iconPixelRatio();
  const ratio = pixelRatio * size;
  const extent = Math.ceil(GLYPH * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = extent;
  const ctx = canvas.getContext('2d')!;
  const [width, height] = icon.size;
  const scale = GLYPH / Math.max(width, height);
  ctx.scale(ratio, ratio);
  ctx.translate((GLYPH - width * scale) / 2, (GLYPH - height * scale) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  for (const d of icon.paths) ctx.fill(new Path2D(d));
  return { image: ctx.getImageData(0, 0, extent, extent), pixelRatio };
}
