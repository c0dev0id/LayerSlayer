import { describe, expect, it } from 'vitest';
import { formatFilter, parseFilter } from '../services/osm';
import list from './osmFeatures.json';
import { filterOsmFeatures, layerLook, loadOsmFeatures, matchingFeature, typedFeature, type OsmFeature } from './osmFeatures';

const features: OsmFeature[] = list.features.map(({ icon: _, ...feature }) => feature);

describe('OSM features', () => {
  it('have unique names, a category and filters written the one way', () => {
    for (const feature of features) {
      expect(feature.category, feature.name).toBeTruthy();
      expect(feature.filters.length, feature.name).toBeGreaterThan(0);
      for (const filter of feature.filters) expect(formatFilter(parseFilter(filter)), feature.name).toBe(filter);
    }
    expect(new Set(features.map((f) => f.name)).size).toBe(features.length);
  });

  it('come with an icon, except those found as lines, which icons do not mark, and names shown alone', async () => {
    const loaded = await loadOsmFeatures();
    expect(loaded).toHaveLength(features.length);
    for (const feature of loaded) {
      if (feature.lines || feature.nameOnly) expect(feature.icon, feature.name).toBeUndefined();
      else expect(feature.icon?.paths.length, feature.name).toBeGreaterThan(0);
    }
    expect(loaded.find((f) => f.name === 'Cattle grids')?.icon?.id).toBe('temaki:cattle_grid');
    expect(loaded.find((f) => f.name === 'Main roads')?.lines).toBe(true);
  });

  it('are found by name, category or tag', () => {
    expect(filterOsmFeatures(features, 'drinking').map((f) => f.name)).toEqual(['Drinking water']);
    expect(filterOsmFeatures(features, 'generator:source=wind').map((f) => f.name)).toEqual(['Wind turbines']);
    expect(filterOsmFeatures(features, 'routes').every((f) => f.category === 'Routes')).toBe(true);
    expect(filterOsmFeatures(features, '')).toHaveLength(features.length);
  });
});

describe('matchingFeature', () => {
  it('finds the feature an element is, among those with an icon', async () => {
    const loaded = await loadOsmFeatures();
    expect(matchingFeature(loaded, { type: 'node', tags: { amenity: 'fuel', brand: 'Aral' } })?.name).toBe('Fuel stations');
    expect(matchingFeature(loaded, { type: 'node', tags: { barrier: 'gate' } })?.name).toBe('Gates');
    expect(matchingFeature(loaded, { type: 'node', tags: { power: 'generator', 'generator:source': 'wind' } })?.name).toBe('Wind turbines');
    expect(matchingFeature(loaded, { type: 'node', tags: { shop: 'jewelry' } })?.name).toBe('All shops');
    // Roads are found as lines, which have no icon.
    expect(matchingFeature(loaded, { type: 'way', tags: { highway: 'track' } })).toBeUndefined();
  });
});

describe('layerLook', () => {
  const fuelIcon = { id: 'maki:fuel', size: [15, 15] as [number, number], paths: ['M0 0h15v15z'] };
  const benchIcon = { id: 'maki:bench', size: [15, 15] as [number, number], paths: ['M0 0h15v15z'] };
  const fuel: OsmFeature = { name: 'Fuel', category: 'C', filters: ['amenity=fuel'], icon: fuelIcon };
  const roads: OsmFeature = { name: 'Roads', category: 'C', filters: ['highway=primary'], lines: true };
  const towns: OsmFeature = { name: 'Towns', category: 'C', filters: ['node place=town'], nameOnly: true };
  const villages: OsmFeature = { name: 'Villages', category: 'C', filters: ['node place=village'], nameOnly: true };

  it('takes the first chosen icon, unless another or none is picked', () => {
    expect(layerLook([roads, fuel], undefined)).toEqual({ icon: fuelIcon });
    expect(layerLook([fuel], benchIcon)).toEqual({ icon: benchIcon });
    expect(layerLook([fuel], null)).toEqual({});
  });

  it('gives features found as lines no icon, even a picked one', () => {
    expect(layerLook([roads], benchIcon)).toEqual({});
  });

  it('writes place names alone, without dots, unless mixed with other features', () => {
    expect(layerLook([towns, villages], undefined)).toEqual({ label: 'name', dots: false });
    expect(layerLook([towns, fuel], undefined)).toEqual({ icon: fuelIcon });
    expect(layerLook([], undefined)).toEqual({});
  });
});

describe('typedFeature', () => {
  it('names typed tags by their filter', () => {
    expect(typedFeature(' power = generator  generator:source=solar')).toEqual({
      name: 'power=generator generator:source=solar',
      category: 'Tags',
      filters: ['power=generator generator:source=solar'],
    });
    expect(() => typedFeature('=x')).toThrow('is not a tag');
  });
});
