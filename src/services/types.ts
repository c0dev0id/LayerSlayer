import type { LayerDraft } from '../model/layer';

/** The kinds of address a layer can be added from. */
export const SERVICE_TYPES = [
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
  { value: 'pmtiles', label: 'PMTiles' },
  { value: 'cog', label: 'Cloud Optimized GeoTIFF' },
  { value: 'geopdf', label: 'GeoPDF' },
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number]['value'];

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
