import { describe, expect, it } from 'vitest';
import { mapIcon } from '../model/icon';
import { ICON_SETS, searchIcons } from './iconSets';

const loadSets = () => Promise.all(ICON_SETS.map((load) => load()));

describe('icon sets', () => {
  it('are built from their packages, paths only', async () => {
    const sets = await loadSets();
    const counts = Object.fromEntries(sets.map((s) => [s.id, Object.keys(s.icons).length]));
    expect(counts.maki).toBeGreaterThan(200);
    expect(counts.temaki).toBeGreaterThan(500);
    expect(counts.mdi).toBeGreaterThan(6500);
    for (const set of sets) {
      for (const icon of Object.values(set.icons)) {
        expect(icon.paths.length).toBeGreaterThan(0);
        // Character references, as some Maki files have in their path data, are decoded.
        for (const d of icon.paths) expect(d).not.toContain('&');
      }
    }
  });

  it('leave out brand logos and deprecated icons', async () => {
    const mdi = (await loadSets()).find((s) => s.id === 'mdi')!;
    expect(mdi.icons['gas-station']).toBeDefined();
    expect(mdi.icons.google).toBeUndefined();
  });

  it('give an icon with its shape', async () => {
    const [maki, , mdi] = await loadSets();
    expect(mapIcon(maki!, 'fuel')).toMatchObject({ id: 'maki:fuel', size: [15, 15] });
    expect(mapIcon(mdi!, 'atv').size).toEqual([24, 24]);
    expect(() => mapIcon(maki!, 'nothing')).toThrow('There is no icon maki:nothing.');
  });

  it('find icons by name and keywords, map sets first', async () => {
    const sets = await loadSets();
    const fuel = searchIcons(sets, 'fuel', 500);
    expect(fuel.icons[0]!.id).toBe('maki:fuel');
    // Material Design's gas station is found by its alias.
    expect(fuel.icons.map((i) => i.id)).toContain('mdi:gas-station');
    expect(searchIcons(sets, 'cattle grid', 10).icons.map((i) => i.id)).toEqual(['temaki:cattle_grid']);
    const limited = searchIcons(sets, '', 5);
    expect(limited.icons).toHaveLength(5);
    expect(limited.total).toBeGreaterThan(7000);
    // The same search gives the same icons, so lists of them are kept rather than redrawn.
    expect(searchIcons(sets, 'fuel', 500).icons[0]).toBe(fuel.icons[0]);
  });
});
