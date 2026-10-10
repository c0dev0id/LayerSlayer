import { describe, expect, it } from 'vitest';
import { countTiles, coveringTiles, sourceTileZoom, spreadTiles, tileUrl } from './tileGrid';

describe('tileUrl', () => {
  it("writes the bounding box exactly as MapLibre did for a WMS tile it asked for", () => {
    // From a GetMap request MapLibre made for geodienste.sachsen.de: tile 11/1096/687.
    const template = 'https://w.example/wms?BBOX={bbox-epsg-3857}&WIDTH=512';
    expect(tileUrl([template], { z: 11, x: 1096, y: 687 })).toBe(
      'https://w.example/wms?BBOX=1408887.3053523675,6574807.42497772,1428455.184593372,6594375.304218724&WIDTH=512',
    );
  });

  it('fills zoom, column and row, flipped for TMS, and the quadkey, prefix and ratio', () => {
    expect(tileUrl(['https://t/{z}/{x}/{y}.png'], { z: 3, x: 4, y: 2 })).toBe('https://t/3/4/2.png');
    expect(tileUrl(['https://t/{z}/{x}/{y}.png'], { z: 3, x: 4, y: 2 }, 'tms')).toBe('https://t/3/4/5.png');
    expect(tileUrl(['https://t/{quadkey}{ratio}/{prefix}'], { z: 3, x: 4, y: 2 }, 'xyz', 2)).toBe('https://t/120@2x/42');
  });

  it('picks the template of several by column and row, as MapLibre spreads tiles over subdomains', () => {
    const templates = ['https://a/{z}/{x}/{y}', 'https://b/{z}/{x}/{y}', 'https://c/{z}/{x}/{y}'];
    expect(tileUrl(templates, { z: 5, x: 1, y: 0 })).toBe('https://b/5/1/0');
    expect(tileUrl(templates, { z: 5, x: 2, y: 2 })).toBe('https://b/5/2/2');
    expect(tileUrl(templates, { z: 5, x: 3, y: 3 })).toBe('https://a/5/3/3');
  });
});

describe('sourceTileZoom', () => {
  it('is the map zoom for 512 px tiles and one deeper for 256 px tiles', () => {
    expect(sourceTileZoom(14, 512)).toBe(14);
    expect(sourceTileZoom(14, 256)).toBe(15);
  });
});

describe('coveringTiles', () => {
  // A triangle around Fischbach: its bounding box holds tiles the triangle does not touch.
  const triangle: [number, number][] = [
    [7.6, 49.0],
    [7.8, 49.0],
    [7.6, 49.15],
  ];

  it('gives the tiles that touch the polygon, not every tile of its bounding box', () => {
    const tiles = [...coveringTiles(triangle, 14)];
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.z === 14)).toBe(true);
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    expect(tiles.length).toBeLessThan(box * 0.7);
    expect(countTiles(triangle, 14)).toBe(tiles.length);
  });

  it('covers a small area inside one tile with that tile, and grows about four times per zoom', () => {
    const square: [number, number][] = [
      [7.70, 49.08],
      [7.71, 49.08],
      [7.71, 49.09],
      [7.70, 49.09],
    ];
    expect(countTiles(square, 8)).toBe(1);
    const at = (z: number) => countTiles(triangle, z);
    expect(at(15) / at(14)).toBeGreaterThan(3);
    expect(at(15) / at(14)).toBeLessThan(5);
  });

  it('finds the same tiles as testing each square of the bounding box', () => {
    // Every tile of the bounding box tested on its own: an edge through its square, or its centre inside.
    const reference = (z: number) => {
      const n = 2 ** z;
      const fraction = ([lng, lat]: [number, number]): [number, number] => {
        const s = Math.sin((lat * Math.PI) / 180);
        return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
      };
      const ring = triangle.map(fraction);
      const inside = ([px, py]: [number, number]) => {
        let within = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]!;
          const [xj, yj] = ring[j]!;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) within = !within;
        }
        return within;
      };
      const meets = ([ax, ay]: [number, number], [bx, by]: [number, number], [x0, y0, x1, y1]: number[]) => {
        let [t0, t1] = [0, 1];
        for (const [p, q] of [[ax - bx, ax - x0!], [bx - ax, x1! - ax], [ay - by, ay - y0!], [by - ay, y1! - ay]] as const) {
          if (p === 0) { if (q < 0) return false; continue; }
          const t = q / p;
          if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
          if (t0 > t1) return false;
        }
        return true;
      };
      const xs = ring.map((p) => Math.floor(p[0] * n));
      const ys = ring.map((p) => Math.floor(p[1] * n));
      const found: string[] = [];
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
        for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
          const box = [x / n, y / n, (x + 1) / n, (y + 1) / n];
          if (ring.some((p, i) => meets(p, ring[(i + 1) % ring.length]!, box)) || inside([(x + 0.5) / n, (y + 0.5) / n])) found.push(`${x}/${y}`);
        }
      }
      return found;
    };
    for (const z of [12, 14, 16]) expect([...coveringTiles(triangle, z)].map((t) => `${t.x}/${t.y}`)).toEqual(reference(z));
  });

  it('spreads samples over the tiles without walking them', () => {
    const tiles = [...coveringTiles(triangle, 15)].map((t) => `${t.x}/${t.y}`);
    const picked = spreadTiles(triangle, 15, undefined, 3).map((t) => `${t.x}/${t.y}`);
    expect(picked).toHaveLength(3);
    expect(picked.every((t) => tiles.includes(t))).toBe(true);
    expect(new Set(picked).size).toBe(3);
    expect(spreadTiles(triangle, 15, [0, 0, 1, 1], 3)).toEqual([]);
  });

  it('keeps to the bounds where given, and refuses areas far too large to walk', () => {
    expect(countTiles(triangle, 14, [0, 0, 1, 1])).toBe(0);
    expect(countTiles(triangle, 14, [7.6, 49.0, 7.65, 49.05])).toBeLessThan(countTiles(triangle, 14));
    expect(countTiles(triangle, 25)).toBe(Infinity);
  });
});
