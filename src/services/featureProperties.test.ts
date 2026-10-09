import { describe, expect, it } from 'vitest';
import { isDataProperty, propertyKeys } from './featureProperties';

describe('propertyKeys', () => {
  it('lists text and number properties, those most features have first, leaving out styling', () => {
    const features = [
      { properties: { name: 'A', styleUrl: '#s', stroke: '#ff0000', ref: 3 } },
      { properties: { name: 'B', description: 'closed', nested: { a: 1 }, flag: true } },
      { properties: null },
    ];
    expect(propertyKeys(features)).toEqual(['name', 'description', 'ref']);
  });

  it('tells styling from data', () => {
    expect(isDataProperty('icon-scale')).toBe(false);
    expect(isDataProperty('name')).toBe(true);
  });
});
