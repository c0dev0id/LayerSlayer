import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { withoutInvalid } from './style';

describe('withoutInvalid', () => {
  it('leaves out invalid layers and the layers of invalid sources', () => {
    const style = {
      version: 8,
      sources: { good: { type: 'geojson', data: 'a.json' }, bad: { type: 'nonsense' } },
      layers: [
        { id: 'ok', type: 'line', source: 'good' },
        { id: 'broken', type: 'line', source: 'good', paint: { 'line-width': 'wide' } },
        { id: 'orphan', type: 'fill', source: 'bad' },
      ],
    } as unknown as StyleSpecification;
    const { style: valid, dropped } = withoutInvalid(style, validateStyleMin(style).map((e) => e.message));
    expect(valid.layers.map((l) => l.id)).toEqual(['ok']);
    expect(Object.keys(valid.sources)).toEqual(['good']);
    expect(dropped.length).toBeGreaterThan(0);
    expect(validateStyleMin(valid)).toEqual([]);
  });
});
