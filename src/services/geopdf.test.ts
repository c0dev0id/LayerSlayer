import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { findViewports, georeference, mainViewport, type GeoViewport } from './geopdf';

/** A page with a map viewport and an inset, as US Topo and similar GeoPDFs have. */
async function geoPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const viewport = (bbox: number[], gpts: number[]) =>
    doc.context.obj({
      Type: 'Viewport',
      BBox: bbox,
      Measure: { Type: 'Measure', Subtype: 'GEO', GPTS: gpts, LPTS: [0, 0, 0, 1, 1, 1, 1, 0] },
    });
  page.node.set(
    PDFName.of('VP'),
    doc.context.obj([
      viewport([550, 750, 50, 50], [47.0, 7.0, 47.2, 7.0, 47.2, 7.2, 47.0, 7.2]),
      viewport([10, 10, 40, 40], [0, 0, 1, 0, 1, 1, 0, 1]),
    ]),
  );
  return doc.save({ useObjectStreams: true });
}

describe('GeoPDF', () => {
  it('reads the geospatial viewports of a page from compressed object streams', async () => {
    const viewports = await findViewports(await geoPdf());
    expect(viewports).toHaveLength(2);
    expect(viewports[0]).toEqual({
      page: 0,
      bbox: [550, 750, 50, 50],
      gpts: [47.0, 7.0, 47.2, 7.0, 47.2, 7.2, 47.0, 7.2],
      lpts: [0, 0, 0, 1, 1, 1, 1, 0],
    });
    expect(mainViewport(viewports)).toBe(viewports[0]);
  });

  it('finds no viewport in a plain PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(await findViewports(await doc.save())).toEqual([]);
  });

  it('maps the unit square onto the rectangle in the order written, as Adobe-style files list the top edge first', () => {
    // The main viewport of GDAL's adobe_style_geospatial.pdf test file, which renders north up.
    const viewport: GeoViewport = {
      page: 0,
      bbox: [57, 713, 561, 297],
      gpts: [44.20536, -65.02379, 44.53593, -65.03521, 44.54453, -64.4757, 44.21387, -64.46741],
      lpts: [0, 1, 0, 0, 1, 0, 1, 1],
    };
    const toLngLat = georeference(viewport);
    const [, topLat] = toLngLat(57, 713);
    const [, bottomLat] = toLngLat(57, 297);
    expect(topLat).toBeCloseTo(44.53593, 4);
    expect(bottomLat).toBeCloseTo(44.20536, 4);
  });

  it('maps page points to longitude and latitude through the viewport', () => {
    const viewport: GeoViewport = {
      page: 0,
      bbox: [50, 50, 550, 750],
      gpts: [47.0, 7.0, 47.2, 7.0, 47.2, 7.2, 47.0, 7.2],
      lpts: [0, 0, 0, 1, 1, 1, 1, 0],
    };
    const toLngLat = georeference(viewport);
    const [lng, lat] = toLngLat(50, 50);
    expect(lng).toBeCloseTo(7.0, 6);
    expect(lat).toBeCloseTo(47.0, 6);
    const [lng2, lat2] = toLngLat(550, 750);
    expect(lng2).toBeCloseTo(7.2, 6);
    expect(lat2).toBeCloseTo(47.2, 6);
  });
});
