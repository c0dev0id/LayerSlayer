import type { PDFDict } from '@cantoo/pdf-lib';
import { lngLatToMercator, mercatorToLngLat } from '../geo/mercator';
import { fitTransform } from '../geo/projective';
import type { Corners } from '../model/layer';

/**
 * A geospatial viewport of a PDF page (ISO 32000-2, Adobe's geospatial extension): a
 * rectangle of the page and points in it with their latitude and longitude.
 */
export interface GeoViewport {
  /** Zero-based page number. */
  page: number;
  /**
   * The rectangle in the page's user space, in the order written: the unit square of
   * `lpts` maps (0, 0) to its first corner and (1, 1) to its second. Writers differ in
   * which edge they list first (GDAL the bottom, Adobe-style files the top), so the order
   * must not be normalised.
   */
  bbox: [number, number, number, number];
  /** Latitude, longitude pairs. */
  gpts: number[];
  /** x, y pairs in the unit square of `bbox`. */
  lpts: number[];
}

/** Longest side of the rendered picture: map detail against GPU memory, and any GPU's texture limit. */
const MAX_SIDE = 4096;
/** Highest render scale, about 430 dpi, so a small page is not blown up for nothing. */
const MAX_SCALE = 6;

/** The geospatial viewports of every page, read with pdf-lib, which exposes the raw page dictionaries. */
export async function findViewports(data: Uint8Array): Promise<GeoViewport[]> {
  const { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } = await import('@cantoo/pdf-lib');
  // Encryption only touches strings; the georeference is numbers.
  const doc = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
  const numbers = (dict: PDFDict, key: string): number[] => {
    const array = dict.lookupMaybe(PDFName.of(key), PDFArray);
    return array ? array.asArray().map((_, i) => array.lookup(i, PDFNumber).asNumber()) : [];
  };
  const viewports: GeoViewport[] = [];
  doc.getPages().forEach((page, index) => {
    const list = page.node.lookupMaybe(PDFName.of('VP'), PDFArray);
    for (let i = 0; i < (list?.size() ?? 0); i++) {
      const viewport = list!.lookup(i, PDFDict);
      const measure = viewport.lookupMaybe(PDFName.of('Measure'), PDFDict);
      if (!measure || measure.lookupMaybe(PDFName.of('Subtype'), PDFName) !== PDFName.of('GEO')) continue;
      const [a, b, c, d] = numbers(viewport, 'BBox');
      if (d === undefined) continue;
      viewports.push({
        page: index,
        bbox: [a!, b!, c!, d],
        gpts: numbers(measure, 'GPTS'),
        lpts: numbers(measure, 'LPTS'),
      });
    }
  });
  return viewports;
}

/** The viewport with the largest area: the map itself rather than an inset or a legend. */
export function mainViewport(viewports: readonly GeoViewport[]): GeoViewport | undefined {
  const area = (v: GeoViewport) => Math.abs((v.bbox[2] - v.bbox[0]) * (v.bbox[3] - v.bbox[1]));
  return viewports.filter((v) => v.gpts.length >= 6 && v.gpts.length === v.lpts.length).sort((a, b) => area(b) - area(a))[0];
}

/**
 * Longitude and latitude of a point in the page's user space. The viewport's point pairs
 * are fitted in Web Mercator, the space the map draws the picture in, projectively for four
 * or more pairs.
 */
export function georeference(viewport: GeoViewport): (x: number, y: number) => [number, number] {
  const from: [number, number][] = [];
  const to: [number, number][] = [];
  for (let i = 0; i + 1 < viewport.lpts.length; i += 2) {
    from.push([viewport.lpts[i]!, viewport.lpts[i + 1]!]);
    to.push(lngLatToMercator(viewport.gpts[i + 1]!, viewport.gpts[i]!));
  }
  const transform = fitTransform(from, to);
  const [x1, y1, x2, y2] = viewport.bbox;
  return (x, y) => {
    const [mx, my] = transform([(x - x1) / (x2 - x1), (y - y1) / (y2 - y1)]);
    return mercatorToLngLat(mx, my);
  };
}

/**
 * Renders the map area of a GeoPDF to a picture and finds where its corners lie. Only the
 * largest geospatial viewport is drawn, cropped to its rectangle, so the collar with legend
 * and margins stays off the map.
 */
export async function renderGeoPdf(data: ArrayBuffer): Promise<{ blob: Blob; coordinates: Corners }> {
  const viewport = mainViewport(await findViewports(new Uint8Array(data.slice(0))));
  if (!viewport) {
    throw new Error('This PDF has no georeference that can be read (a geospatial viewport as in ISO 32000-2).');
  }
  const toLngLat = georeference(viewport);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await loading.promise;
  try {
    const page = await doc.getPage(viewport.page + 1);
    const unit = page.getViewport({ scale: 1 });
    const [x1, y1, x2, y2] = viewport.bbox;
    const [ax, ay] = unit.convertToViewportPoint(x1, y1) as [number, number];
    const [bx, by] = unit.convertToViewportPoint(x2, y2) as [number, number];
    const left = Math.min(ax, bx);
    const top = Math.min(ay, by);
    const scale = Math.min(MAX_SCALE, MAX_SIDE / Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
    const width = Math.round(Math.abs(bx - ax) * scale);
    const height = Math.round(Math.abs(by - ay) * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const rendering = page.getViewport({ scale, offsetX: -left * scale, offsetY: -top * scale });
    await page.render({ canvas, viewport: rendering, background: '#ffffff' }).promise;
    const corner = (px: number, py: number) => toLngLat(...(rendering.convertToPdfPoint(px, py) as [number, number]));
    const coordinates: Corners = [corner(0, 0), corner(width, 0), corner(width, height), corner(0, height)];
    return { blob: await canvasBlob(canvas), coordinates };
  } finally {
    await loading.destroy();
  }
}

/** The picture as WebP where the browser can encode it (it falls back to PNG by itself). */
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The page could not be encoded.'))), 'image/webp', 0.92),
  );
}
