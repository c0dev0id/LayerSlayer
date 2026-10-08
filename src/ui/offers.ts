import type { Offer } from '../services/types';

/**
 * The origin a layer added from `offer` of the source at `sourceUrl` carries: the address,
 * and the layer's name in the source after a space. An offer without a name (a tile
 * template, a style, a whole MapServer) is the source's only layer of its kind, so the
 * address alone names it, whatever title the service gives it.
 */
export function originOf(sourceUrl: string, offer: Offer): string {
  return offer.name ? `${sourceUrl} ${offer.name}` : sourceUrl;
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
