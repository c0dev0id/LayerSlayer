import { validBounds } from '../geo/mercator';
import { resolveUrl } from '../map/urls';
import type { Bounds } from '../model/layer';
import { FEATURE_MINZOOM, type Offer, type ServiceInfo } from './types';

/** Most features asked for per tile. */
export const OGC_FEATURES_LIMIT = 1000;

interface Link {
  rel?: string;
  type?: string;
  href: string;
}

interface Collection {
  id: string;
  title?: string;
  description?: string;
  itemType?: string;
  extent?: { spatial?: { bbox?: number[][]; crs?: string } };
  links?: Link[];
}

/**
 * Where an OGC API lists its collections, from the address of its collections or of one
 * collection (or its items): the collections address and the collection asked for. None
 * for a landing page, whose links say where its collections are.
 */
export function collectionsAddress(url: string): { collections: string; id?: string } | undefined {
  const [path, query] = url.split('?');
  const match = /^(.*\/collections)(?:\/([^/]+))?(?:\/items)?\/?$/.exec(path!);
  if (!match) return undefined;
  const id = match[2] ? decodeURIComponent(match[2]) : undefined;
  return { collections: match[1]! + (query ? `?${query}` : ''), ...(id && { id }) };
}

/** The collections address a landing page links to. */
export function landingPageCollections(json: { links?: Link[] }, url: string): string {
  const link = json.links?.find((l) => l.rel === 'data' || l.rel === 'http://www.opengis.net/def/rel/ogc/1.0/data');
  if (!link) throw new Error('This is not the landing page of an OGC API with collections.');
  return resolveUrl(link.href, url);
}

const CRS84 = /OGC\/1\.3\/CRS84$|CRS84$/;

function collectionBounds(collection: Collection): Bounds | undefined {
  const spatial = collection.extent?.spatial;
  const box = spatial?.bbox?.[0];
  if (!box || (spatial?.crs && !CRS84.test(spatial.crs))) return undefined;
  const [west, south, east, north] = box.length === 6 ? [box[0], box[1], box[3], box[4]] : box;
  return west !== undefined && south !== undefined && east !== undefined && north !== undefined ? validBounds(west, south, east, north) : undefined;
}

/**
 * The address of a collection's items as GeoJSON: the items link of that type, preferring
 * plain GeoJSON over JSON-FG where a server offers both profiles.
 */
function itemsUrl(collection: Collection, collectionsUrl: string): string {
  const items = (collection.links ?? []).filter((l) => l.rel === 'items');
  const geojson = items.filter((l) => l.type === 'application/geo+json');
  const link =
    geojson.find((l) => /profile=rfc7946/.test(l.href)) ??
    geojson.find((l) => !/jsonfg/i.test(l.href)) ??
    geojson[0] ??
    items.find((l) => l.type === 'application/json');
  const base = collectionsUrl.split('?')[0]!;
  return link ? resolveUrl(link.href, `${base}/`) : `${base}/${encodeURIComponent(collection.id)}/items?f=json`;
}

/** Reads an OGC API's collections; only the collection `id` where one was asked for. */
export function parseCollections(json: { title?: string; description?: string; collections?: Collection[] }, collectionsUrl: string, id?: string): ServiceInfo {
  if (!Array.isArray(json.collections)) throw new Error('This is not a list of OGC API collections.');
  const collections = id ? json.collections.filter((c) => c.id === id) : json.collections;
  if (id && collections.length === 0) throw new Error(`The API has no collection ${id}.`);
  return {
    title: json.title ?? 'OGC API – Features',
    ...(json.description && { description: json.description }),
    offers: collections.map((collection): Offer => {
      const title = collection.title ?? collection.id;
      const offer: Offer = { title, name: collection.id, depth: 0, ...(collection.description && { description: collection.description }) };
      if (collection.itemType !== undefined && collection.itemType !== 'feature') return { ...offer, reason: 'Not a collection of features.' };
      const bounds = collectionBounds(collection);
      offer.draft = {
        name: title,
        source: { type: 'ogc-features', url: itemsUrl(collection, collectionsUrl), limit: OGC_FEATURES_LIMIT },
        minzoom: FEATURE_MINZOOM,
        ...(bounds && { bounds }),
      };
      return offer;
    }),
  };
}
