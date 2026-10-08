import { describe, expect, it } from 'vitest';
import { formatFilter, parseFilter } from '../services/overpass';
import list from './osmFeatures.json';
import { filterOsmFeatures, typedFeature, type OsmFeature } from './osmFeatures';

const features: OsmFeature[] = list.features;

describe('OSM features', () => {
  it('have unique names, a category and filters written the one way', () => {
    for (const feature of features) {
      expect(feature.category, feature.name).toBeTruthy();
      expect(feature.filters.length, feature.name).toBeGreaterThan(0);
      for (const filter of feature.filters) expect(formatFilter(parseFilter(filter)), feature.name).toBe(filter);
    }
    expect(new Set(features.map((f) => f.name)).size).toBe(features.length);
  });

  it('are found by name, category or tag', () => {
    expect(filterOsmFeatures(features, 'drinking').map((f) => f.name)).toEqual(['Drinking water']);
    expect(filterOsmFeatures(features, 'generator:source=wind').map((f) => f.name)).toEqual(['Wind turbines']);
    expect(filterOsmFeatures(features, 'routes').every((f) => f.category === 'Routes')).toBe(true);
    expect(filterOsmFeatures(features, '')).toHaveLength(features.length);
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
