import type { Map as MapLibreMap } from 'maplibre-gl';
import { lngLatToMercator, mercatorToLngLat } from '../geo/mercator';
import type { LngLat } from '../model/route';
import { state } from '../state/store';
import { MAP_BACKGROUND } from './compose';
import { fitZoom } from './focusOverlay';

/**
 * The focus area's edge, on a canvas over the map's: a shadow beyond it, a bevel just inside
 * and an outline. The light comes from a fixed direction on screen, so the area looks raised
 * however the map is turned or tilted; a style could only light the edges from a direction
 * on the map. The canvas is drawn again after each frame of the map that moves the area.
 */

/** How high the area seems raised: the length of its shadow in CSS pixels while it fills the view. */
const ELEVATION = 28;
/** Where the light comes from on screen, clockwise from up: north-north-west, as in MapLibre's hillshading. */
const LIGHT = (335 * Math.PI) / 180;
/** The steps each edge is drawn in, so that it follows the ground in 3D. */
const EDGE_STEPS = 16;
/** The outline, in the colour of the coastlines on the cover. */
const OUTLINE = 'rgba(255, 255, 255, 0.55)';

/**
 * The shadow on a cover of the given background colour, which the cover shows 40 % of the
 * way to black: dark, or a light glow where the cover is too dark for a shadow to show.
 */
export function shadowColor(background: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => (parseInt(background.slice(i, i + 2), 16) / 255) * 0.6) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.45)';
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

/** Draws the focus area's edge over `map` after each of its frames, until the returned function is called. */
export function drawFocusShadow(map: MapLibreMap): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'focus-shadow';
  map.getCanvas().after(canvas);
  const context = canvas.getContext('2d')!;
  let corners: readonly LngLat[] | undefined;
  let points: LngLat[] = [];
  let fit = 0;
  /** What the canvas shows: its size, the shadow's colour and the area's place on screen. */
  let shown = '';
  const draw = () => {
    const ratio = window.devicePixelRatio;
    const width = Math.round(map.getCanvas().clientWidth * ratio);
    const height = Math.round(map.getCanvas().clientHeight * ratio);
    if (state.focus !== corners) {
      [corners, points] = [state.focus, state.focus ? edgePoints(state.focus) : []];
      fit = state.focus ? fitZoom(state.focus.map(([lng, lat]) => lngLatToMercator(lng, lat))) : 0;
    }
    const screen = points.map((p) => map.project(p));
    const color = shadowColor(state.settings.background ?? MAP_BACKGROUND);
    // The map draws many frames that leave the area where it is, such as while tiles load.
    const showing = [width, height, color, ...screen.map(({ x, y }) => `${Math.round(x * 4)},${Math.round(y * 4)}`)].join(' ');
    if (showing === shown) return;
    shown = showing;
    if (canvas.width !== width || canvas.height !== height) [canvas.width, canvas.height] = [width, height];
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (screen.length === 0) return;
    const area = new Path2D();
    screen.forEach(({ x, y }, i) => (i === 0 ? area.moveTo(x, y) : area.lineTo(x, y)));
    area.closePath();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Canvas shadows are measured in device pixels, whatever the transform.
    const shadow = (color: string, length: number, blur: number) => {
      context.shadowColor = color;
      context.shadowBlur = blur * ratio;
      context.shadowOffsetX = -Math.sin(LIGHT) * length * ratio;
      context.shadowOffsetY = Math.cos(LIGHT) * length * ratio;
    };

    // The area filled and casting its shadow, then the area wiped out, leaving the shadow.
    context.save();
    const length = shadowLength(map.getZoom(), fit);
    shadow(color, length, length);
    context.fill(area);
    context.restore();
    context.globalCompositeOperation = 'destination-out';
    context.fill(area);
    context.globalCompositeOperation = 'source-over';

    // The bevel: the surroundings, shifted away from and towards the light, shade the inside
    // of the edges, light where they face the light and dark where they face away.
    const xs = screen.map((p) => p.x);
    const ys = screen.map((p) => p.y);
    const around = new Path2D();
    around.rect(Math.min(...xs) - ELEVATION, Math.min(...ys) - ELEVATION, Math.max(...xs) - Math.min(...xs) + 2 * ELEVATION, Math.max(...ys) - Math.min(...ys) + 2 * ELEVATION);
    around.addPath(area);
    context.save();
    context.clip(area);
    shadow('rgba(255, 255, 255, 0.5)', 3, 3);
    context.fill(around, 'evenodd');
    shadow('rgba(0, 0, 0, 0.35)', -3, 3);
    context.fill(around, 'evenodd');
    context.restore();

    context.strokeStyle = OUTLINE;
    context.lineWidth = 1.5;
    context.lineJoin = 'round';
    context.stroke(area);
  };
  map.on('render', draw);
  return () => {
    map.off('render', draw);
    canvas.remove();
  };
}
