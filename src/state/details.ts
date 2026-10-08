import { createMemo, createResource, createRoot, createSignal } from 'solid-js';
import type { LngLat } from '../model/route';
import { findDetails } from '../services/osmDetails';

/**
 * The details of a spot on the map that are open: the spot, how far around it to look, and
 * what OpenStreetMap has there. The map highlights what was found while they are open.
 */

interface DetailsRequest {
  spot: LngLat;
  radius: number;
}

const [detailsRequest, setDetailsRequest] = createSignal<DetailsRequest>();
export { detailsRequest };

/** Opens the details of what lies at a spot, in place of those open before. */
export function showDetails(spot: LngLat, radius: number): void {
  setDetailsRequest({ spot, radius });
}

export function closeDetails(): void {
  setDetailsRequest(undefined);
}

export const [details] = createRoot(() => createResource(detailsRequest, ({ spot, radius }) => findDetails(spot, radius)));

const NOTHING: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** The spot and what was found there, while the details are open, with their kind as `kind`. */
export const detailsHighlight = createRoot(() =>
  createMemo((): GeoJSON.FeatureCollection => {
    const request = detailsRequest();
    if (!request) return NOTHING;
    const found = details.state === 'ready' ? details() : [];
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { kind: 'spot' }, geometry: { type: 'Point', coordinates: request.spot } },
        ...found.map((d): GeoJSON.Feature => ({ type: 'Feature', properties: { kind: d.kind }, geometry: d.geometry })),
      ],
    };
  }),
);
