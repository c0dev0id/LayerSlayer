import { describe, expect, it } from 'vitest';
import { bulkPolicy } from './bulkPolicies';

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

  it('allows codevoid.de full speed, whatever the subdomain', () => {
    expect(bulkPolicy('codevoid.de')?.level).toBe('full');
    expect(bulkPolicy('tiles.codevoid.de')?.level).toBe('full');
    expect(bulkPolicy('notcodevoid.de')).toBeUndefined();
    expect(bulkPolicy('codevoid.de.example.com')).toBeUndefined();
  });
});
