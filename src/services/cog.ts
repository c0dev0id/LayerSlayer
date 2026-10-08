import { fromUrl, type GeoTIFF, type GeoTIFFImage } from 'geotiff';
import { isWebMercatorCode, mercatorBounds } from '../geo/mercator';
import type { CogSource } from '../model/layer';
import type { ServiceInfo } from './types';

/**
 * Overviews larger than this are not read for the value range of a colour ramp: they are
 * decoded on the page's main thread. Files made by GDAL have overviews well below it.
 */
const MAX_STATS_PIXELS = 1024 * 1024;

/**
 * Whether an image holds measurements in one band (elevation, temperature) rather than a
 * picture: grey values of more than 8 bits would be drawn clipped, so they get a colour ramp.
 */
function isData(image: GeoTIFFImage): boolean {
  const photometric = image.fileDirectory.getValue('PhotometricInterpretation') as number | undefined;
  return image.getSamplesPerPixel() === 1 && (photometric === undefined || photometric <= 1) && image.getBitsPerSample(0) > 8;
}

/**
 * The range of values in the smallest overview (scale and offset applied), for the colour
 * ramp; nodata and NaN are left out. The whole file is never read.
 */
async function valueRange(tiff: GeoTIFF): Promise<{ min: number; max: number }> {
  for (let i = (await tiff.getImageCount()) - 1; i >= 0; i--) {
    const image = await tiff.getImage(i);
    // Bit 2 of NewSubfileType marks a transparency mask.
    if (((image.fileDirectory.getValue('NewSubfileType') as number | undefined) ?? 0) & 4) continue;
    if (image.getWidth() * image.getHeight() > MAX_STATS_PIXELS) break;
    const noData = image.getGDALNoData();
    const meta = (await image.getGDALMetadata(0)) as Record<string, string> | null;
    const scale = Number(meta?.SCALE ?? 1);
    const offset = Number(meta?.OFFSET ?? 0);
    const [band] = (await image.readRasters({ samples: [0] })) as unknown as ArrayLike<number>[];
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < band!.length; j++) {
      const raw = band![j]!;
      if (raw === noData || Number.isNaN(raw)) continue;
      const value = raw * scale + offset;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (min <= max) return { min, max: max > min ? max : min + 1 };
    break;
  }
  throw new Error('The values of this GeoTIFF could not be read for a colour ramp.');
}

/**
 * A Cloud Optimized GeoTIFF as one layer: imagery in its own colours, single-band data with
 * a colour ramp over the values of its smallest overview. GeoTIFFs in other projections
 * are turned away, since the COG protocol does not reproject.
 */
export async function describeCog(tiff: GeoTIFF, url: string, title: string): Promise<ServiceInfo> {
  const image = await tiff.getImage();
  const keys = image.getGeoKeys() ?? {};
  const projected = keys.ProjectedCSTypeGeoKey as number | undefined;
  if (!isWebMercatorCode(projected)) {
    const crs = projected ?? (keys.GeographicTypeGeoKey as number | undefined);
    throw new Error(
      `This GeoTIFF is in ${crs ? `EPSG:${crs}` : 'an unknown coordinate system'}; webmap draws GeoTIFFs in Web Mercator ` +
        '(EPSG:3857) only. GDAL converts it: gdalwarp -t_srs EPSG:3857 -of COG.',
    );
  }
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const bounds = mercatorBounds(minX!, minY!, maxX!, maxY!);
  const source: CogSource = { type: 'cog', url, ...(isData(image) && { ramp: await valueRange(tiff) }) };
  return { title, offers: [{ title, depth: 0, draft: { name: title, source, ...(bounds && { bounds }) } }] };
}

export async function readCog(url: string, title: string): Promise<ServiceInfo> {
  return describeCog(await fromUrl(url), url, title);
}
