import type { Offer, ServiceInfo } from '../services/types';

/**
 * The origin a layer added from `offer` of the source at `sourceUrl` carries: the address,
 * and the layer's name in the source after a space. An offer without a name (a tile
 * template, a style, a whole MapServer) is the source's only layer of its kind, so the
 * address alone names it, whatever title the service gives it.
 */
export function originOf(sourceUrl: string, offer: Offer): string {
  return offer.name ? `${sourceUrl} ${offer.name}` : sourceUrl;
}

/** A layer's origin taken apart: the source's address, and the layer's name in it where it has one. */
export function splitOrigin(origin: string): { address: string; name?: string } {
  const space = origin.indexOf(' ');
  return space < 0 ? { address: origin } : { address: origin.slice(0, space), name: origin.slice(space + 1) };
}

/**
 * The service's offers with each layer's path in its tree as `originPath`: the titles of
 * the headings it is nested under, outermost first, then its own, as the service gives them.
 */
export function withPaths(info: ServiceInfo): ServiceInfo {
  const above: Offer[] = [];
  return {
    ...info,
    offers: info.offers.map((offer) => {
      while (above.length > 0 && above[above.length - 1]!.depth >= offer.depth) above.pop();
      above.push(offer);
      return offer.draft ? { ...offer, draft: { ...offer.draft, originPath: above.map((o) => o.title) } } : offer;
    }),
  };
}

/** Whether a layer's origin is one of the source's layers. */
export function isFromSource(origin: string | undefined, sourceUrl: string): boolean {
  return origin === sourceUrl || (origin?.startsWith(`${sourceUrl} `) ?? false);
}

/**
 * The layers that can be added under the heading at `index`: the offers after it that are
 * nested deeper, up to the next offer at its depth or above.
 */
export function groupMembers(offers: readonly Offer[], index: number): Offer[] {
  const heading = offers[index];
  if (!heading) return [];
  const members: Offer[] = [];
  for (let i = index + 1; i < offers.length && offers[i]!.depth > heading.depth; i++) {
    if (offers[i]!.draft) members.push(offers[i]!);
  }
  return members;
}

export type Selection = 'none' | 'some' | 'all';

/** How many of `offers` are on the map, for a toggle that stands for all of them. */
export function selection(offers: readonly Offer[], isAdded: (offer: Offer) => boolean): Selection {
  const added = offers.filter(isAdded).length;
  return added === 0 ? 'none' : added === offers.length ? 'all' : 'some';
}
