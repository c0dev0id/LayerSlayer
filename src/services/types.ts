import type { LayerDraft } from '../model/layer';

/** The kinds of address a layer can be added from. */
export type ServiceType =
  | 'wms'
  | 'wmts'
  | 'wfs'
  | 'ogc-features'
  | 'arcgis-mapserver'
  | 'arcgis-features'
  | 'xyz'
  | 'vector-tiles'
  | 'geojson'
  | 'style'
  | 'geopdf';

export const SERVICE_TYPES: readonly { value: ServiceType; label: string }[] = [
  { value: 'wms', label: 'WMS' },
  { value: 'wmts', label: 'WMTS' },
  { value: 'wfs', label: 'WFS' },
  { value: 'ogc-features', label: 'OGC API – Features' },
  { value: 'arcgis-mapserver', label: 'ArcGIS MapServer' },
  { value: 'arcgis-features', label: 'ArcGIS FeatureServer' },
  { value: 'xyz', label: 'XYZ tiles' },
  { value: 'vector-tiles', label: 'Vector tiles (MVT)' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'style', label: 'MapLibre style' },
  { value: 'geopdf', label: 'GeoPDF' },
];

/**
 * The lowest zoom a feature layer is shown at unless the service asks for more. Below it a
 * view needs few tiles, but each covers so much that the server returns its whole record
 * limit for it, slowly; the layer's zoom range can be widened in the panel.
 */
export const FEATURE_MINZOOM = 9;

/** One entry of what a service offers: a layer to add, a heading, or a layer that cannot be shown. */
export interface Offer {
  title: string;
  /** The service's identifier for it, where it has one. */
  name?: string;
  description?: string;
  /** Nesting level in the service's layer tree. */
  depth: number;
  /** Absent for a heading or a layer that cannot be shown. */
  draft?: LayerDraft;
  /** Why the layer cannot be shown. */
  reason?: string;
}

export interface ServiceInfo {
  title: string;
  description?: string;
  offers: Offer[];
}
