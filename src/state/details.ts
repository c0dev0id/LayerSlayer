import { createMemo, createResource, createRoot, createSignal } from 'solid-js';
import type { LngLat } from '../model/route';
import type { FeatureDescription } from '../services/featureDetails';
import { findDetails } from '../services/osmDetails';
import { findSea } from '../services/seas';

/**
 * The details that are open: what OpenStreetMap has around a spot on the map, or the
 * features of the map's own layers tapped there. The map highlights what they are about
 * while they are open.
 */

/** What OpenStreetMap has within `radius` metres of a spot. */
interface OsmRequest {
  kind: 'osm';
  spot: LngLat;
  radius: number;
}

/** A feature of a layer on the map, in words, with its geometry as drawn. */
export interface LayerFeature extends FeatureDescription {
  /** The name of its layer. */
  layer: string;
  geometry: GeoJSON.Geometry;
}

/** Features of the layers on the map, tapped at a spot. */
interface FeaturesRequest {
  kind: 'features';
  spot: LngLat;
  features: LayerFeature[];
}

export type DetailsRequest = OsmRequest | FeaturesRequest;

const [detailsRequest, setDetailsRequest] = createSignal<DetailsRequest>();
export { detailsRequest };

/** Opens what OpenStreetMap has around a spot, in place of the details open before. */
export function showDetails(spot: LngLat, radius: number): void {
  setDetailsRequest({ kind: 'osm', spot, radius });
}

/** Opens tapped features of the layers on the map, in place of the details open before. */
export function showFeatures(spot: LngLat, features: LayerFeature[]): void {
  setDetailsRequest({ kind: 'features', spot, features });
}

export function closeDetails(): void {
  setDetailsRequest(undefined);
}

/** The details asked of OpenStreetMap, while they are open. */
export const osmRequest = createRoot(() =>
  createMemo(() => {
    const request = detailsRequest();
    return request?.kind === 'osm' ? request : undefined;
  }),
);

/** What OpenStreetMap has around the spot, while those details are open. */
export const [details] = createRoot(() => createResource(osmRequest, ({ spot, radius }) => findDetails(spot, radius)));

/**
 * The sea or ocean the spot lies in, asked for beside OpenStreetMap, which maps none as an
 * area. It adds to the details rather than making them, so where it cannot be found there
 * is just no sea.
 */
export const [sea] = createRoot(() => createResource(osmRequest, ({ spot }) => findSea(spot).catch(() => undefined)));

const NOTHING: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * What the open details are about, with their kind as `kind`: the spot asked about and
 * what OpenStreetMap has there, or the features tapped.
 */
export const detailsHighlight = createRoot(() =>
  createMemo((): GeoJSON.FeatureCollection => {
    const request = detailsRequest();
    if (!request) return NOTHING;
    if (request.kind === 'features') {
      return {
        type: 'FeatureCollection',
        features: request.features.map((f): GeoJSON.Feature => ({ type: 'Feature', properties: { kind: 'feature' }, geometry: f.geometry })),
      };
    }
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
