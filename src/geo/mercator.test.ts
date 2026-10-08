import { describe, expect, it } from 'vitest';
import { HALF_WORLD, coversMostOfWorld, mercatorToLngLat, scaleToZoom, tileAt, tileZoom, validBounds } from './mercator';

describe('mercator', () => {
  it('converts scale denominators to map zooms', () => {
    // GoogleMapsCompatible: 256 px tile zoom 1 is map zoom 0.
    expect(scaleToZoom(279541132.0143589)).toBeCloseTo(0, 6);
    expect(scaleToZoom(17061.8)).toBeCloseTo(14, 3);
  });

  it('finds whole tile zooms from resolutions', () => {
    expect(tileZoom(156543.03392800014, 256)).toBe(0);
    expect(tileZoom(78271.51696399994, 512)).toBe(0);
    expect(tileZoom(19567.87924099992, 256)).toBe(3);
    expect(tileZoom(100000, 256)).toBeUndefined();
  });

  it('converts metres to degrees', () => {
    const [lng, lat] = mercatorToLngLat(HALF_WORLD, HALF_WORLD);
    expect(lng).toBeCloseTo(180);
    expect(lat).toBeCloseTo(85.0511, 3);
  });

  it('tells world-wide bounds from regional ones', () => {
    expect(coversMostOfWorld([-180, -90, 180, 90])).toBe(true);
    // A week of earthquakes: every longitude, no poles, under half the world's area.
    expect(coversMostOfWorld([-179.98, -58.16, 179.88, 69.62])).toBe(true);
    // Pole to pole over Europe and Africa.
    expect(coversMostOfWorld([-30, -85, 60, 85])).toBe(true);
    // The United States, North America, Europe.
    expect(coversMostOfWorld([-125, 24, -66, 50])).toBe(false);
    expect(coversMostOfWorld([-170, 18, -50, 83])).toBe(false);
    expect(coversMostOfWorld([-25, 34, 45, 72])).toBe(false);
  });

  it('accepts only bounds in degrees and clamps the poles', () => {
    expect(validBounds(-180, -90, 180, 90)).toEqual([-180, -85.0511287798, 180, 85.0511287798]);
    expect(validBounds(-180, -90, 427603, 4285332)).toBeUndefined();
    expect(validBounds(10, 50, 5, 51)).toBeUndefined();
  });
});

describe('tileAt', () => {
  it('finds the tile that holds a position, rows from the north', () => {
    expect(tileAt(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileAt(11.575, 48.137, 14)).toEqual({ x: 8718, y: 5685 });
    expect(tileAt(-180, 89, 2)).toEqual({ x: 0, y: 0 });
    expect(tileAt(180, -89, 2)).toEqual({ x: 3, y: 3 });
  });
});
