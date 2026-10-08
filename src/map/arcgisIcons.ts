import { PX_PER_PT, readSymbology, type DrawingInfo, type Marker, type PictureMarker, type SimpleMarker, type Symbology } from '../services/arcgisSymbology';
import type { ArcGisFeatureSource } from '../model/layer';
import { fetchResource } from '../state/net';
import { resolveUrl, withParams } from './urls';

/** An icon for the map's addImage, drawn at `pixelRatio` device pixels per CSS pixel. */
export interface Icon {
  image: ImageData | ImageBitmap;
  pixelRatio: number;
}

function cssColor(color: SimpleMarker['color']): string | undefined {
  if (!Array.isArray(color) || color.length < 3 || (color[3] ?? 255) === 0) return undefined;
  return `rgba(${color[0]},${color[1]},${color[2]},${(color[3] ?? 255) / 255})`;
}

/** A simple marker drawn on a canvas: its shape filled and outlined, turned by its angle. */
function drawSimple(marker: SimpleMarker, ratio: number): Icon {
  const size = (marker.size ?? 8) * PX_PER_PT;
  const outlineColor = cssColor(marker.outline?.color);
  const outline = outlineColor ? (marker.outline?.width ?? 1) * PX_PER_PT : 0;
  const extent = Math.ceil((size + outline) * ratio * Math.SQRT2) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = extent;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(extent / 2, extent / 2);
  ctx.scale(ratio, ratio);
  // ArcGIS turns markers counterclockwise.
  ctx.rotate((-(marker.angle ?? 0) * Math.PI) / 180);
  const r = size / 2;
  ctx.beginPath();
  switch (marker.style) {
    case 'esriSMSSquare':
      ctx.rect(-r, -r, size, size);
      break;
    case 'esriSMSDiamond':
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      break;
    case 'esriSMSTriangle':
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.8);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      break;
    case 'esriSMSCross':
    case 'esriSMSX':
      // Two strokes, upright or turned to an X.
      if (marker.style === 'esriSMSX') ctx.rotate(Math.PI / 4);
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.lineWidth = Math.max(outline, size / 6);
      ctx.strokeStyle = outlineColor ?? cssColor(marker.color) ?? 'black';
      ctx.stroke();
      return { image: ctx.getImageData(0, 0, extent, extent), pixelRatio: ratio };
    default:
      ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  const fill = cssColor(marker.color);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (outlineColor) {
    ctx.lineWidth = outline;
    ctx.strokeStyle = outlineColor;
    ctx.stroke();
  }
  return { image: ctx.getImageData(0, 0, extent, extent), pixelRatio: ratio };
}

/** A picture marker from the image data it carries, or from the layer's image folder. */
async function drawPicture(marker: PictureMarker, layerUrl: string): Promise<Icon> {
  const blob = marker.imageData
    ? await (await fetch(`data:${marker.contentType ?? 'image/png'};base64,${marker.imageData}`)).blob()
    : await (await fetchResource(resolveUrl(`images/${marker.url ?? ''}`, `${layerUrl}/`))).blob();
  const image = await createImageBitmap(blob);
  // The picture is shown at its width in points, whatever its pixel size.
  const width = (marker.width ?? image.width * 0.75) * PX_PER_PT;
  return { image, pixelRatio: image.width / width };
}

async function drawMarkers(markers: Record<string, Marker>, layerUrl: string): Promise<Map<string, Icon>> {
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const entries = await Promise.all(
    Object.entries(markers).map(async ([name, marker]): Promise<[string, Icon]> => [
      name,
      marker.type === 'esriSMS' ? drawSimple(marker, ratio) : await drawPicture(marker, layerUrl),
    ]),
  );
  return new Map(entries);
}

/** A feature layer's own symbology, read from its description, with its icons drawn. */
export async function loadSymbology(source: ArcGisFeatureSource, iconPrefix: string): Promise<{ symbology: Symbology; icons: Map<string, Icon> }> {
  const description = (await (await fetchResource(withParams(source.url, { f: 'json' }))).json()) as { drawingInfo?: DrawingInfo; error?: { message?: string } };
  if (description.error) throw new Error(description.error.message ?? 'The layer could not be read.');
  const symbology = readSymbology(description.drawingInfo, source.geometry, iconPrefix);
  return { symbology, icons: symbology.markers ? await drawMarkers(symbology.markers, source.url) : new Map() };
}
