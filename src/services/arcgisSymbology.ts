import type { Geometry } from '../model/layer';

/**
 * An ArcGIS feature layer's own symbology (its `drawingInfo`) as MapLibre paint and layout
 * values: one value for a simple renderer, a `match` on the field values for a unique value
 * renderer, a `step` over the class breaks for a class breaks renderer. Point symbols become
 * icons, named here and drawn by the map side. Sizes in points become pixels.
 */

/** An ArcGIS colour: red, green, blue and alpha, 0 to 255. */
type ArcGisColor = [number, number, number, number] | null | undefined;

export interface SimpleMarker {
  type: 'esriSMS';
  style?: string;
  color?: ArcGisColor;
  /** Diameter in points. */
  size?: number;
  angle?: number;
  outline?: { color?: ArcGisColor; width?: number };
}

export interface PictureMarker {
  type: 'esriPMS';
  imageData?: string;
  contentType?: string;
  url?: string;
  /** In points. */
  width?: number;
  height?: number;
  angle?: number;
}

export type Marker = SimpleMarker | PictureMarker;

interface SimpleLine {
  type: 'esriSLS';
  style?: string;
  color?: ArcGisColor;
  width?: number;
}

interface SimpleFill {
  type: 'esriSFS';
  style?: string;
  color?: ArcGisColor;
  outline?: SimpleLine;
}

type ArcGisSymbol = Marker | SimpleLine | SimpleFill | { type: string };

interface Renderer {
  type: string;
  symbol?: ArcGisSymbol;
  defaultSymbol?: ArcGisSymbol;
  field1?: string;
  field2?: string;
  field3?: string;
  fieldDelimiter?: string;
  uniqueValueInfos?: { value: unknown; symbol?: ArcGisSymbol }[];
  field?: string;
  classBreakInfos?: { classMaxValue: number; symbol?: ArcGisSymbol }[];
}

export interface DrawingInfo {
  renderer?: Renderer;
  /** 0 (opaque) to 100. */
  transparency?: number;
}

/** What a feature layer looks like by its own symbology. */
export interface Symbology {
  /** 0 to 1, from the layer's transparency. */
  opacity: number;
  /** Points: the icon of each feature, and the marker symbol of each icon name. */
  icon?: unknown;
  markers?: Record<string, Marker>;
  /** Lines, and the outlines of areas. */
  lineColor?: unknown;
  lineWidth?: unknown;
  lineDash?: unknown;
  /** Areas. */
  fillColor?: unknown;
}

const TRANSPARENT = 'rgba(0,0,0,0)';
/** Points to CSS pixels. */
export const PX_PER_PT = 4 / 3;

function cssColor(color: ArcGisColor): string {
  if (!Array.isArray(color) || color.length < 3) return TRANSPARENT;
  const [r, g, b, a = 255] = color;
  return `rgba(${r},${g},${b},${Math.round((a / 255) * 1000) / 1000})`;
}

/** Dash patterns of line styles, in line widths; solid lines draw a dash without gaps. */
const DASHES: Record<string, number[]> = {
  esriSLSDash: [3, 2],
  esriSLSDot: [1, 2],
  esriSLSDashDot: [3, 2, 1, 2],
  esriSLSDashDotDot: [3, 2, 1, 2, 1, 2],
  esriSLSShortDash: [2, 2],
  esriSLSShortDot: [1, 1],
  esriSLSLongDash: [6, 3],
  esriSLSShortDashDot: [2, 2, 1, 2],
  esriSLSLongDashDot: [6, 3, 1, 3],
};
const SOLID = [1, 0];

/**
 * The value a symbol gives for each feature: the symbol's value under a simple renderer, a
 * match on the joined field values under a unique value renderer, a step over the upper
 * bounds of the classes under a class breaks renderer. Features no class or value takes
 * get the default symbol's value.
 */
function byRenderer(renderer: Renderer, value: (symbol: ArcGisSymbol | undefined) => unknown): unknown {
  const fallback = value(renderer.defaultSymbol);
  switch (renderer.type) {
    case 'simple':
      return value(renderer.symbol);
    case 'uniqueValue': {
      const fields = [renderer.field1, renderer.field2, renderer.field3].filter((f): f is string => !!f);
      if (fields.length === 0) throw new Error('The unique value renderer names no field.');
      const parts = fields.map((f) => ['to-string', ['get', f]]);
      const key = parts.length === 1 ? parts[0] : ['concat', ...parts.flatMap((p, i) => (i === 0 ? [p] : [renderer.fieldDelimiter ?? ',', p]))];
      const seen = new Set<string>();
      const pairs = (renderer.uniqueValueInfos ?? []).flatMap((info) => {
        const label = String(info.value);
        if (seen.has(label)) return [];
        seen.add(label);
        return [label, value(info.symbol)];
      });
      return pairs.length > 0 ? ['match', key, ...pairs, fallback] : fallback;
    }
    case 'classBreaks': {
      if (!renderer.field) throw new Error('The class breaks renderer names no field.');
      const infos = [...(renderer.classBreakInfos ?? [])].sort((a, b) => a.classMaxValue - b.classMaxValue);
      if (infos.length === 0) return fallback;
      // A class runs up to and including its maximum; a step starts the next class at its stop.
      const stops = infos.slice(0, -1).flatMap((info, i) => [info.classMaxValue + 1e-9, value(infos[i + 1]!.symbol)]);
      const field = ['get', renderer.field];
      return ['case', ['==', field, null], fallback, ['step', ['to-number', field], value(infos[0]!.symbol), ...stops]];
    }
    default:
      throw new Error(`The layer is drawn with a ${renderer.type} renderer, which Layer Slayer cannot draw.`);
  }
}

/** Every symbol a renderer uses. */
function symbolsOf(renderer: Renderer): ArcGisSymbol[] {
  return [
    renderer.symbol,
    renderer.defaultSymbol,
    ...(renderer.uniqueValueInfos ?? []).map((i) => i.symbol),
    ...(renderer.classBreakInfos ?? []).map((i) => i.symbol),
  ].filter((s): s is ArcGisSymbol => !!s);
}

const isMarker = (s: ArcGisSymbol | undefined): s is Marker => s?.type === 'esriSMS' || s?.type === 'esriPMS';

/**
 * A layer's symbology for its geometry. Icon names start with `iconPrefix`, so that they
 * are unique in the map. Renderers and symbols that cannot be drawn throw, with the reason.
 */
export function readSymbology(info: DrawingInfo | undefined, geometry: Geometry, iconPrefix: string): Symbology {
  const renderer = info?.renderer;
  if (!renderer) throw new Error('The service describes no symbology for this layer.');
  const symbols = symbolsOf(renderer);
  const unknown = symbols.find((s) => !['esriSMS', 'esriPMS', 'esriSLS', 'esriSFS'].includes(s.type));
  if (unknown) throw new Error(`The layer uses ${unknown.type.replace(/^CIM.*/, 'CIM')} symbols, which Layer Slayer cannot draw.`);
  const opacity = 1 - Math.min(100, Math.max(0, info?.transparency ?? 0)) / 100;

  if (geometry === 'point') {
    const markers: Record<string, Marker> = {};
    const names = new Map<ArcGisSymbol, string>();
    for (const symbol of symbols) {
      if (!isMarker(symbol) || names.has(symbol)) continue;
      const name = `${iconPrefix}${names.size}`;
      names.set(symbol, name);
      markers[name] = symbol;
    }
    return { opacity, markers, icon: byRenderer(renderer, (s) => (s && names.get(s)) ?? '') };
  }

  const line = (s: ArcGisSymbol | undefined): SimpleLine | undefined =>
    s?.type === 'esriSLS' ? (s as SimpleLine) : s?.type === 'esriSFS' ? (s as SimpleFill).outline : undefined;
  const lineWidth = (s: ArcGisSymbol | undefined) => {
    const l = line(s);
    return l && l.style !== 'esriSLSNull' ? Math.round((l.width ?? 1) * PX_PER_PT * 100) / 100 : 0;
  };
  const dashed = symbols.some((s) => DASHES[line(s)?.style ?? '']);
  const lines: Symbology = {
    opacity,
    lineColor: byRenderer(renderer, (s) => cssColor(line(s)?.color)),
    lineWidth: byRenderer(renderer, lineWidth),
    ...(dashed && { lineDash: byRenderer(renderer, (s) => ['literal', DASHES[line(s)?.style ?? ''] ?? SOLID]) }),
  };
  if (geometry === 'line') return lines;
  return {
    ...lines,
    fillColor: byRenderer(renderer, (s) => {
      if (s?.type !== 'esriSFS') return TRANSPARENT;
      const fill = s as SimpleFill;
      // Hatched fills are drawn as a light wash of their colour.
      if (fill.style === 'esriSFSNull') return TRANSPARENT;
      if (fill.style && fill.style !== 'esriSFSSolid' && Array.isArray(fill.color)) {
        return cssColor([fill.color[0], fill.color[1], fill.color[2], (fill.color[3] ?? 255) * 0.35]);
      }
      return cssColor(fill.color);
    }),
  };
}
