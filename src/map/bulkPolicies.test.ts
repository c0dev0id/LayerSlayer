import { describe, expect, it } from 'vitest';
import { bulkPolicy, fullSpeedFetches } from './bulkPolicies';

describe('bulkPolicy', () => {
  it('forbids the OSM Foundation and OpenRailwayMap servers, whatever the subdomain', () => {
    expect(bulkPolicy('tile.openstreetmap.org')?.level).toBe('forbidden');
    expect(bulkPolicy('a.tile.openstreetmap.org')?.level).toBe('forbidden');
    expect(bulkPolicy('b.tiles.openrailwaymap.org')?.level).toBe('forbidden');
  });

  it('warns for volunteer servers, and knows nothing of the others', () => {
    expect(bulkPolicy('a.tile.opentopomap.org')?.level).toBe('warn');
    expect(bulkPolicy('a.tile-cyclosm.openstreetmap.fr')?.level).toBe('warn');
    expect(bulkPolicy('sgx.geodatenzentrum.de')).toBeUndefined();
    expect(bulkPolicy('notopenstreetmap.org')).toBeUndefined();
    expect(bulkPolicy(undefined)).toBeUndefined();
  });
});

describe('fullSpeedFetches', () => {
  it('fetches codevoid.de four tiles at a time, whatever the subdomain, and no other server', () => {
    expect(fullSpeedFetches('codevoid.de')).toBe(4);
    expect(fullSpeedFetches('tiles.codevoid.de')).toBe(4);
    expect(fullSpeedFetches('notcodevoid.de')).toBeUndefined();
    expect(fullSpeedFetches('codevoid.de.example.com')).toBeUndefined();
    expect(fullSpeedFetches(undefined)).toBeUndefined();
  });
});
