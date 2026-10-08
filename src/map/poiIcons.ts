import type { MapIcon } from '../model/icon';
import { MAX_ICON_SIZE, MIN_ICON_SIZE } from '../model/layer';
import { iconPixelRatio, type Icon } from './icon';

/**
 * Layer icons on the map: a white icon on a disc of the layer's colour, ringed in white,
 * readable on any base map. Each icon, colour and size is a map image of its own, drawn
 * when the map first asks for it, so that larger icons are drawn larger rather than scaled.
 */

/** Diameter of the disc, of the icon on it, and width of the ring, in CSS pixels at size 1. */
const DISC = 22;
const GLYPH = 13;
const RING = 1.5;

/** The map image of an icon on a disc of `color` (#rrggbb), `size` times its normal size. */
export function poiImageId(icon: MapIcon, color: string, size: number): string {
  return `poi:${icon.id}:${color}:${size}`;
}

/** The icon id, colour and size a map image stands for, if it is a layer icon's. */
export function parsePoiImageId(id: string): { icon: string; color: string; size: number } | undefined {
  const match = /^poi:([^:]+:[^:]+):(#[0-9a-f]{6}):(\d+(?:\.\d+)?)$/i.exec(id);
  return match ? { icon: match[1]!, color: match[2]!, size: Number(match[3]) } : undefined;
}

export function drawPoi(icon: MapIcon, color: string, size: number): Icon {
  // Drawn at `size` times the display's resolution but handed to the map at the display's
  // pixel ratio, the icon shows `size` times larger and stays sharp.
  const pixelRatio = iconPixelRatio();
  const ratio = pixelRatio * Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, size));
  const extent = Math.ceil((DISC + 2 * RING) * ratio) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = extent;
  const ctx = canvas.getContext('2d')!;
  const center = extent / ratio / 2;
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  ctx.arc(center, center, DISC / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = RING;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  const [width, height] = icon.size;
  const scale = GLYPH / Math.max(width, height);
  ctx.translate(center - (width * scale) / 2, center - (height * scale) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  for (const d of icon.paths) ctx.fill(new Path2D(d));
  return { image: ctx.getImageData(0, 0, extent, extent), pixelRatio };
}
