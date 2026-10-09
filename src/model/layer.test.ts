import { describe, expect, it } from 'vitest';
import { areaZoom, createLayer } from './layer';

describe('createLayer', () => {
  const source = { type: 'geojson', data: { url: 'https://a.example/g.geojson' } } as const;

  it('starts half transparent, opaque with an icon, or as the draft says', () => {
    expect(createLayer({ name: 'g', source }, []).opacity).toBe(0.5);
    expect(createLayer({ name: 'g', source, icon: { id: 'maki:fuel', size: [15, 15], paths: ['M0 0h1z'] } }, []).opacity).toBe(1);
    expect(createLayer({ name: 'g', source, opacity: 0.8 }, []).opacity).toBe(0.8);
  });
});

describe('areaZoom', () => {
  it('shows the area as it fits where the layer is drawn at that zoom', () => {
    expect(areaZoom(12, { minzoom: 0, maxzoom: 24 })).toBe(12);
    expect(areaZoom(12, { minzoom: 6.5, maxzoom: 24 })).toBe(12);
  });

  it('comes in as far as a layer drawn only closer needs, however large its area', () => {
    expect(areaZoom(5, { minzoom: 17, maxzoom: 22 })).toBe(17);
    expect(areaZoom(5, { minzoom: 18.1, maxzoom: 24 })).toBe(18.1);
  });

  it('stays short of the zoom a layer is hidden from, and no closer than 16 otherwise', () => {
    expect(areaZoom(14, { minzoom: 5, maxzoom: 10 })).toBe(9.5);
    expect(areaZoom(20, { minzoom: 0, maxzoom: 24 })).toBe(16);
    expect(areaZoom(20, { minzoom: 17, maxzoom: 22 })).toBe(17);
    expect(areaZoom(20, { minzoom: 10, maxzoom: 10.4 })).toBe(10.2);
  });
});
