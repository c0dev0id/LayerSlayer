import { afterEach, describe, expect, it, vi } from 'vitest';
import { elevationsAt, heightAt, terrarium, tilePosition } from './elevation';

describe('terrarium', () => {
  it('decodes metres from red, green and blue', () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(129, 44, 128)).toBe(300.5);
    expect(terrarium(127, 255, 0)).toBe(-1);
  });
});

describe('tilePosition', () => {
  it('finds the zoom 12 tile and the position in its 512 pixels', () => {
    expect(tilePosition([0, 0])).toEqual({ tile: { z: 12, x: 2048, y: 2048 }, x: -0.5, y: -0.5 });
    const { tile, x, y } = tilePosition([7.7, 49.1]);
    expect(tile).toEqual({ z: 12, x: 2135, y: 1404 });
    expect(x).toBeGreaterThanOrEqual(-0.5);
    expect(x).toBeLessThan(511.5);
    expect(y).toBeGreaterThanOrEqual(-0.5);
    expect(y).toBeLessThan(511.5);
  });
});

describe('heightAt', () => {
  it('interpolates between pixel centres and holds the edge pixels to the edge', () => {
    const rgba = new Uint8ClampedArray(512 * 512 * 4);
    // 100, 200, 300 and 400 m: 32868, 32968, 33068 and 33168 as red × 256 + green.
    const set = (pixel: number, metres: number) => rgba.set([Math.floor((metres + 32768) / 256), (metres + 32768) % 256, 0], pixel * 4);
    set(0, 100);
    set(1, 200);
    set(512, 300);
    set(513, 400);
    expect(heightAt(rgba, 0, 0)).toBe(100);
    expect(heightAt(rgba, 0.5, 0)).toBe(150);
    expect(heightAt(rgba, 0.5, 0.5)).toBe(250);
    expect(heightAt(rgba, -0.5, -0.5)).toBe(100);
  });
});

describe('elevationsAt', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Tiles that are 100 m everywhere, but for the tile at (0, 0), which cannot be read, or for all with `down`. */
  function stubTiles(down = false) {
    const webp = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([4, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
    const rgba = new Uint8ClampedArray(512 * 512 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([128, 100, 0, 255], i);
    const fetch = vi.fn(async (url: string) => (down || url.includes('/12/2048/2048') ? new Response('', { status: 503 }) : new Response(webp)));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('createImageBitmap', async () => ({ close() {} }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage() {}, getImageData: () => ({ data: rgba }) };
        }
      },
    );
    return fetch;
  }

  it('reads each tile once, leaving the points of a tile that fails without a value', async () => {
    const fetch = stubTiles();
    expect(await elevationsAt([[7.7, 49.1], [0, 0], [7.7001, 49.1]])).toEqual([100, Number.NaN, 100]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails when no tile can be read', async () => {
    stubTiles(true);
    await expect(elevationsAt([[0, 0]])).rejects.toThrow('503');
  });
});
