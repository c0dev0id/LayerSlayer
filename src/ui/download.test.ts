import { describe, expect, it } from 'vitest';
import { fileNameFor } from './download';

describe('fileNameFor', () => {
  it('adds the extension once and replaces characters file systems refuse', () => {
    expect(fileNameFor('Bunker: Pfalz / Saar', 'geojson')).toBe('Bunker- Pfalz - Saar.geojson');
    expect(fileNameFor('track.geojson', 'geojson')).toBe('track.geojson');
    expect(fileNameFor(' .. ', 'geojson')).toBe('layer.geojson');
  });
});
