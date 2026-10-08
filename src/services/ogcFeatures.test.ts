import { describe, expect, it } from 'vitest';
import { collectionsAddress, landingPageCollections, OGC_FEATURES_LIMIT, parseCollections } from './ogcFeatures';

const collections = {
  title: 'Daraa',
  collections: [
    {
      id: 'AeronauticCrv',
      title: 'Aeronautic (Curves)',
      itemType: 'feature',
      extent: { spatial: { bbox: [[36.395158, 32.693301, 36.430814, 32.717333]], crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' } },
      links: [
        { rel: 'items', type: 'text/html', href: 'https://demo.ldproxy.net/daraa/collections/AeronauticCrv/items?f=html' },
        { rel: 'items', type: 'application/geo+json', href: 'https://demo.ldproxy.net/daraa/collections/AeronauticCrv/items?f=json&profile=jsonfg' },
        { rel: 'items', type: 'application/geo+json', href: 'https://demo.ldproxy.net/daraa/collections/AeronauticCrv/items?f=json&profile=rfc7946' },
      ],
    },
    { id: 'lakes', title: 'Large Lakes', links: [{ rel: 'items', type: 'application/geo+json', href: 'lakes/items?f=json' }] },
    { id: 'tiles', itemType: 'record' },
    { id: 'bare', extent: { spatial: { bbox: [[1, 2, 0, 3, 4, 100]] } } },
  ],
};

describe('collectionsAddress', () => {
  it('finds the collections from a collection or its items', () => {
    expect(collectionsAddress('https://x/api/collections')).toEqual({ collections: 'https://x/api/collections' });
    expect(collectionsAddress('https://x/api/collections/lakes/items?f=json')).toEqual({ collections: 'https://x/api/collections?f=json', id: 'lakes' });
    expect(collectionsAddress('https://x/api')).toBeUndefined();
  });

  it('follows a landing page to its collections', () => {
    const landing = { links: [{ rel: 'self', href: 'https://x/api' }, { rel: 'data', href: 'collections' }] };
    expect(landingPageCollections(landing, 'https://x/api/')).toBe('https://x/api/collections');
    expect(() => landingPageCollections({ links: [] }, 'https://x/api')).toThrow('not the landing page');
  });
});

describe('parseCollections', () => {
  it('offers feature collections, read through their plain GeoJSON items', () => {
    const info = parseCollections(collections, 'https://demo.ldproxy.net/daraa/collections');
    expect(info.title).toBe('Daraa');
    expect(info.offers[0]!.draft).toEqual({
      name: 'Aeronautic (Curves)',
      source: { type: 'ogc-features', url: 'https://demo.ldproxy.net/daraa/collections/AeronauticCrv/items?f=json&profile=rfc7946', limit: OGC_FEATURES_LIMIT },
      bounds: [36.395158, 32.693301, 36.430814, 32.717333],
    });
    expect(info.offers[1]!.draft!.source).toMatchObject({ url: 'https://demo.ldproxy.net/daraa/collections/lakes/items?f=json' });
    expect(info.offers[2]!.reason).toBe('Not a collection of features.');
    expect(info.offers[3]!.draft).toMatchObject({ source: { url: 'https://demo.ldproxy.net/daraa/collections/bare/items?f=json' }, bounds: [1, 2, 3, 4] });
  });

  it('offers only the collection asked for', () => {
    expect(parseCollections(collections, 'https://x/collections', 'lakes').offers.map((o) => o.name)).toEqual(['lakes']);
    expect(() => parseCollections(collections, 'https://x/collections', 'nope')).toThrow('no collection nope');
  });
});
