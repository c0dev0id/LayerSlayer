import { fromArrayBuffer, writeArrayBuffer } from 'geotiff';
import { describe, expect, it } from 'vitest';
import { describeCog } from './cog';

/** A 2 × 2 GeoTIFF placed in Web Mercator unless other geokeys are given. */
async function geotiff(values: ArrayLike<number>, options: Record<string, unknown>) {
  const placed = { width: 2, height: 2, ModelPixelScale: [1000, 1000, 0], ModelTiepoint: [0, 0, 0, 1000000, 6000000, 0], ...options };
  return fromArrayBuffer(await writeArrayBuffer(values as never, placed as never));
}

const mercator = { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3857 };

describe('describeCog', () => {
  it('draws imagery in its own colours, within its bounds', async () => {
    const tiff = await geotiff(new Uint8Array(12), { ...mercator, SamplesPerPixel: 3, PhotometricInterpretation: 2 });
    const { offers } = await describeCog(tiff, 'https://x/ortho.tif', 'ortho');
    expect(offers[0]!.draft!.source).toEqual({ type: 'cog', url: 'https://x/ortho.tif' });
    const [west, south, east, north] = offers[0]!.draft!.bounds!;
    expect([west, south, east, north].map((v) => Math.round(v * 1000) / 1000)).toEqual([8.983, 47.342, 9.001, 47.354]);
  });

  it('colours single-band data over its values, leaving out nodata', async () => {
    const tiff = await geotiff(new Float32Array([120, 480, 300, -9999]), {
      ...mercator,
      BitsPerSample: [32],
      SampleFormat: [3],
      GDAL_NODATA: '-9999',
    });
    const { offers } = await describeCog(tiff, 'https://x/dem.tif', 'dem');
    expect(offers[0]!.draft!.source).toEqual({ type: 'cog', url: 'https://x/dem.tif', ramp: { min: 120, max: 480 } });
  });

  it('turns away other projections', async () => {
    const geographic = await geotiff(new Uint8Array(4), { GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326 });
    await expect(describeCog(geographic, 'https://x/a.tif', 'a')).rejects.toThrow('EPSG:4326; webmap draws GeoTIFFs in Web Mercator');
    const utm = await geotiff(new Uint8Array(4), { GTModelTypeGeoKey: 1, ProjectedCSTypeGeoKey: 25832 });
    await expect(describeCog(utm, 'https://x/b.tif', 'b')).rejects.toThrow('EPSG:25832');
  });
});
