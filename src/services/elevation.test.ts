import { describe, expect, it } from 'vitest';
import { heightAt, terrarium, tilePosition } from './elevation';

describe('terrarium', () => {
  it('decodes metres from red, green and blue', () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(129, 44, 128)).toBe(300.5);
    expect(terrarium(127, 255, 0)).toBe(-1);
  });
});

describe('tilePosition', () => {
  it('finds the zoom 12 tile and the position in its 512 pixels', () => {
    expect(tilePosition([0, 0])).toEqual({ tile: '12/2048/2048', x: -0.5, y: -0.5 });
    const { tile, x, y } = tilePosition([7.7, 49.1]);
    expect(tile).toBe('12/2135/1404');
    expect(x).toBeGreaterThanOrEqual(-0.5);
    expect(x).toBeLessThan(511.5);
    expect(y).toBeGreaterThanOrEqual(-0.5);
    expect(y).toBeLessThan(511.5);
  });
});

describe('heightAt', () => {
  it('interpolates between pixel centres and holds the edge pixels to the edge', () => {
    const heights = new Float32Array(512 * 512);
    heights[0] = 100;
    heights[1] = 200;
    heights[512] = 300;
    heights[513] = 400;
    expect(heightAt(heights, 0, 0)).toBe(100);
    expect(heightAt(heights, 0.5, 0)).toBe(150);
    expect(heightAt(heights, 0.5, 0.5)).toBe(250);
    expect(heightAt(heights, -0.5, -0.5)).toBe(100);
  });
});
