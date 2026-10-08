import { describe, expect, it } from 'vitest';
import { createLayer } from './layer';

describe('createLayer', () => {
  const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;

  it('starts half transparent, opaque with an icon, or as the draft says', () => {
    expect(createLayer({ name: 'g', source }, []).opacity).toBe(0.5);
    expect(createLayer({ name: 'g', source, icon: { id: 'maki:fuel', size: [15, 15], paths: ['M0 0h1z'] } }, []).opacity).toBe(1);
    expect(createLayer({ name: 'g', source, opacity: 0.8 }, []).opacity).toBe(0.8);
  });
});
