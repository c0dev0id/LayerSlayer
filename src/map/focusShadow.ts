import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, on } from 'solid-js';
import { boxOf } from '../geo/bounds';
import { lngLatToMercator, mercatorToLngLat } from '../geo/mercator';
import type { LngLat } from '../model/route';
import { state } from '../state/store';
import { BACKGROUND_STATE } from './compose';
import { COASTLINES, COVER_DIM, fitZoom } from './focusOverlay';

/**
 * The focus area's edge, on canvases over the map's: a shadow beyond it, a bevel just inside
 * and an outline. The light comes from a fixed direction on screen, so the area looks raised
 * however the map is turned or tilted; a style could only light the edges from a direction
 * on the map. The canvases are drawn again after each frame of the map that moves the area.
 */

/** How high the area seems raised: the length of its shadow in CSS pixels while it fills the view. */
const ELEVATION = 28;
/** How far the bevel reaches into the area, in CSS pixels. */
const BEVEL = 3;
/** Where the light comes from on screen, clockwise from up: north-north-west, as in MapLibre's hillshading. */
const LIGHT = (335 * Math.PI) / 180;
/** The steps each edge is drawn in, so that it follows the ground in 3D. */
const EDGE_STEPS = 16;

/** How light a #rrggbb colour is, 0 to 1. */
function lightness(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour of the area's shadow where none is chosen, on the cover of a map with the
 * given background colour: black, or white, a glow, where the cover is too dark for a
 * shadow to show.
 */
export function autoShadowColor(background: string): string {
  return lightness(background) * (1 - COVER_DIM) < 0.2 ? '#ffffff' : '#000000';
}

/** A shadow of a #rrggbb colour as the canvas draws it: see-through, a light one more so. */
export function shadowFill(color: string): string {
  const opacity = lightness(color) > 0.5 ? 0.3 : 0.45;
  return color + Math.round(opacity * 255).toString(16).padStart(2, '0');
}

/**
 * The length of the area's shadow at a map zoom, given the zoom at which the area fills the
 * view: shorter as the area gets smaller, so that the shadow keeps its shape, and no longer
 * once the area fills the view, where it would soon cover the screen.
 */
export function shadowLength(zoom: number, fit: number): number {
  return ELEVATION * Math.min(1, 2 ** (zoom - fit));
}

/** Positions along the edges of an area, each edge in EDGE_STEPS straight in Web Mercator, where the map draws it straight. */
export function edgePoints(corners: readonly LngLat[]): LngLat[] {
  const points = corners.map(([lng, lat]) => lngLatToMercator(lng, lat));
  return points.flatMap(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length]!;
    return Array.from({ length: EDGE_STEPS }, (_, k) => mercatorToLngLat(x1 + ((x2 - x1) * k) / EDGE_STEPS, y1 + ((y2 - y1) * k) / EDGE_STEPS));
  });
}

/** Lets `context` cast shadows `length` CSS pixels away from the light, as far blurred, at `scale` canvas pixels to the CSS pixel. */
function castShadow(context: CanvasRenderingContext2D, color: string, length: number, scale: number) {
  // Canvas shadows are measured in canvas pixels, whatever the transform.
  context.shadowColor = color;
  context.shadowBlur = Math.abs(length) * scale;
  context.shadowOffsetX = -Math.sin(LIGHT) * length * scale;
  context.shadowOffsetY = Math.cos(LIGHT) * length * scale;
}

/** The shadow the area casts: the area filled with its shadow, then wiped out. Drawn one canvas pixel to the CSS pixel. */
function paintShadow(context: CanvasRenderingContext2D, area: Path2D, color: string, length: number) {
  context.save();
  castShadow(context, color, length, 1);
  context.fill(area);
  context.restore();
  context.globalCompositeOperation = 'destination-out';
  context.fill(area);
  context.globalCompositeOperation = 'source-over';
}

/**
 * The bevel and the outline, in the colour `outline`, of the area, whose screen box is
 * `box`. For the bevel, the surroundings, shifted away from and towards the light, shade
 * the inside of the edges: light where they face the light and dark where they face away.
 */
function paintEdge(context: CanvasRenderingContext2D, area: Path2D, [left, top, right, bottom]: readonly [number, number, number, number], outline: string, ratio: number) {
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const around = new Path2D();
  around.rect(left - 3 * BEVEL, top - 3 * BEVEL, right - left + 6 * BEVEL, bottom - top + 6 * BEVEL);
  around.addPath(area);
  context.save();
  context.clip(area);
  castShadow(context, 'rgba(255, 255, 255, 0.5)', BEVEL, ratio);
  context.fill(around, 'evenodd');
  castShadow(context, 'rgba(0, 0, 0, 0.35)', -BEVEL, ratio);
  context.fill(around, 'evenodd');
  context.restore();
  context.strokeStyle = outline;
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
  context.stroke(area);
}

/** An empty `canvas` of the given size in canvas pixels. */
function emptied(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')!;
  if (canvas.width !== width || canvas.height !== height) [canvas.width, canvas.height] = [width, height];
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

/**
 * Draws the focus area's edge over `map` after each of its frames that moves the area on
 * screen, and has the map draw a frame when the edge's colours change.
 */
export function drawFocusShadow(map: MapLibreMap): void {
  // The shadow is soft, so one canvas pixel to the CSS pixel will do; the bevel and outline are drawn sharp.
  const soft = document.createElement('canvas');
  const sharp = document.createElement('canvas');
  soft.className = sharp.className = 'focus-shadow';
  map.getCanvas().after(soft, sharp);
  createEffect(on(() => [state.settings.focusOutline, state.settings.focusShadow], () => map.triggerRepaint(), { defer: true }));
  /** What the canvases show: their size, the colours and the area's place on screen. */
  let shown = '';
  map.on('render', () => {
    const ratio = map.getPixelRatio();
    const { width, height } = map.getCanvas();
    // The colour the cover is drawn in; none before the first composed style, nor a cover.
    const background = map.getGlobalState()[BACKGROUND_STATE] as string | undefined;
    const { focusOutline, focusShadow } = state.settings;
    const screen = (state.focus ? edgePoints(state.focus) : []).map((p) => map.project(p));
    // The map draws many frames that leave the area where it is, such as while tiles load.
    const showing = [width, height, background, focusOutline, focusShadow, ...screen.map(({ x, y }) => `${Math.round(x * 4)},${Math.round(y * 4)}`)].join(' ');
    if (showing === shown) return;
    shown = showing;
    const softContext = emptied(soft, Math.round(width / ratio), Math.round(height / ratio));
    const sharpContext = emptied(sharp, width, height);
    if (!state.focus || !background) return;
    const area = new Path2D();
    screen.forEach(({ x, y }, i) => (i === 0 ? area.moveTo(x, y) : area.lineTo(x, y)));
    area.closePath();
    const fit = fitZoom(state.focus.map(([lng, lat]) => lngLatToMercator(lng, lat)));
    paintShadow(softContext, area, shadowFill(focusShadow ?? autoShadowColor(background)), shadowLength(map.getZoom(), fit));
    paintEdge(sharpContext, area, boxOf(screen.map(({ x, y }) => [x, y])), focusOutline ?? COASTLINES, ratio);
  });
}
