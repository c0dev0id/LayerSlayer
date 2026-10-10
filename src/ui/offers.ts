import type { LayerDraft } from '../model/layer';
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

/** A layer's origin taken apart: the source's address, and the layer's name in it where it has one. */
export function splitOrigin(origin: string): { address: string; name?: string } {
  const space = origin.indexOf(' ');
  return space < 0 ? { address: origin } : { address: origin.slice(0, space), name: origin.slice(space + 1) };
}

/**
 * The titles leading to an offer in its source's layer tree: the headings it is nested
 * under, outermost first, then its own.
 */
export function offerPath(offers: readonly Offer[], offer: Offer): string[] {
  const path = [offer.title];
  let depth = offer.depth;
  for (let i = offers.indexOf(offer) - 1; i >= 0 && depth > 0; i--) {
    const above = offers[i]!;
    if (above.depth < depth) {
      path.unshift(above.title);
      depth = above.depth;
    }
  }
  return path;
}

/** The layer an offer of the source at `sourceUrl` adds, with where it came from; undefined for a heading. */
export function offerLayer(sourceUrl: string, offers: readonly Offer[], offer: Offer): LayerDraft | undefined {
  return offer.draft && { ...offer.draft, origin: originOf(sourceUrl, offer), originPath: offerPath(offers, offer) };
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
