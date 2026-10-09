import { describe, expect, it } from 'vitest';
import { findOsmFeatures } from './osmSearch';

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const fail = (reason: string) => () => Promise.reject(new Error(reason));

describe('findOsmFeatures', () => {
  it('takes the first source that answers', async () => {
    const asked: string[] = [];
    const found = await findOsmFeatures(['military=bunker'], [], [
      { name: 'Postpass', find: () => (asked.push('Postpass'), Promise.resolve(empty)) },
      { name: 'Overpass API', find: () => (asked.push('Overpass API'), Promise.resolve(empty)) },
    ]);
    expect(found).toBe(empty);
    expect(asked).toEqual(['Postpass']);
  });

  it('falls back to the next source, and names every reason when none answers', async () => {
    await expect(findOsmFeatures([], [], [{ name: 'Postpass', find: fail('down') }, { name: 'Overpass API', find: () => Promise.resolve(empty) }])).resolves.toBe(empty);
    await expect(findOsmFeatures([], [], [{ name: 'Postpass', find: fail('down.') }, { name: 'Overpass API', find: fail('busy.') }])).rejects.toThrow(
      'Postpass: down. Overpass API: busy.',
    );
  });
});
