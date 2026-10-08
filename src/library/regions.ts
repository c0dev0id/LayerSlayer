import type { Bounds } from '../model/layer';

/**
 * Where the services of a library region have data, as boxes generous enough to hold the
 * whole country: overseas parts that its national services cover get boxes of their own.
 * Global services have none, as they are everywhere.
 */
export const REGION_BOUNDS: Readonly<Record<string, readonly Bounds[]>> = {
  Australia: [[112.5, -44, 154, -10]],
  Austria: [[9.4, 46.3, 17.3, 49.1]],
  Belgium: [[2.4, 49.4, 6.5, 51.6]],
  Brazil: [[-74.1, -34, -34.6, 5.4]],
  Canada: [[-141.1, 41.6, -52.5, 83.2]],
  Europe: [[-31.5, 27.5, 45, 71.5]],
  France: [
    [-5.3, 41.2, 9.7, 51.2],
    // Guadeloupe and Martinique, French Guiana, Réunion, Mayotte.
    [-61.9, 14.3, -60.7, 16.6],
    [-54.7, 2, -51.5, 5.9],
    [55.1, -21.5, 55.9, -20.8],
    [44.9, -13.1, 45.4, -12.5],
  ],
  Germany: [[5.8, 47.2, 15.1, 55.1]],
  Netherlands: [[3.3, 50.7, 7.3, 53.6]],
  Norway: [
    [4.4, 57.9, 31.2, 71.3],
    // Svalbard.
    [10, 74, 34, 81],
  ],
  Poland: [[14, 48.9, 24.2, 55]],
  Portugal: [
    [-9.6, 36.9, -6.1, 42.2],
    // The Azores and Madeira.
    [-31.4, 36.8, -24.9, 39.8],
    [-17.3, 32.3, -16.2, 33.2],
  ],
  Spain: [
    [-9.4, 35.2, 4.4, 43.8],
    // The Canary Islands.
    [-18.2, 27.6, -13.4, 29.5],
  ],
  Switzerland: [[5.9, 45.8, 10.5, 47.9]],
  'United Kingdom': [[-8.7, 49.8, 1.8, 60.9]],
  'United States': [
    [-125, 24.4, -66.9, 49.4],
    // Alaska, Hawaii, Puerto Rico and the Virgin Islands.
    [-180, 51, -129.9, 71.5],
    [-160.3, 18.9, -154.8, 22.3],
    [-67.3, 17.6, -64.5, 18.6],
  ],
};
