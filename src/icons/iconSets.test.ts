import { describe, expect, it } from 'vitest';
import { ICON_SET_IDS, loadIcon, loadIconSet, searchIcons } from './iconSets';

describe('icon sets', () => {
  it('are built from their packages, paths only', async () => {
    const sets = await Promise.all(ICON_SET_IDS.map(loadIconSet));
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
    const mdi = await loadIconSet('mdi');
    expect(mdi.icons['gas-station']).toBeDefined();
    expect(mdi.icons.google).toBeUndefined();
  });

  it('give an icon with its shape', async () => {
    expect(await loadIcon('maki:fuel')).toMatchObject({ id: 'maki:fuel', size: [15, 15] });
    expect((await loadIcon('mdi:atv')).size).toEqual([24, 24]);
    await expect(loadIcon('maki:nothing')).rejects.toThrow('There is no icon maki:nothing.');
    await expect(loadIcon('nope:fuel')).rejects.toThrow('There is no icon set nope.');
  });

  it('find icons by name and keywords, map sets first', async () => {
    const sets = await Promise.all(ICON_SET_IDS.map(loadIconSet));
    const fuel = searchIcons(sets, 'fuel', 500);
    expect(fuel.icons[0]!.id).toBe('maki:fuel');
    // Material Design's gas station is found by its alias.
    expect(fuel.icons.map((i) => i.id)).toContain('mdi:gas-station');
    expect(searchIcons(sets, 'cattle grid', 10).icons.map((i) => i.id)).toEqual(['temaki:cattle_grid']);
    const limited = searchIcons(sets, '', 5);
    expect(limited.icons).toHaveLength(5);
    expect(limited.total).toBeGreaterThan(7000);
  });
});
