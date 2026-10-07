import type { LayerDraft } from '../model/layer';

/** The kinds of address a layer can be added from. */
export type ServiceType = 'wms' | 'wmts' | 'arcgis-mapserver' | 'arcgis-features' | 'xyz' | 'geojson' | 'style' | 'geopdf';

export const SERVICE_TYPES: readonly { value: ServiceType; label: string }[] = [
  { value: 'wms', label: 'WMS' },
  { value: 'wmts', label: 'WMTS' },
  { value: 'arcgis-mapserver', label: 'ArcGIS MapServer' },
  { value: 'arcgis-features', label: 'ArcGIS FeatureServer' },
  { value: 'xyz', label: 'XYZ tiles' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'style', label: 'MapLibre style' },
  { value: 'geopdf', label: 'GeoPDF' },
];

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
