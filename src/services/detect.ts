import { getParam } from '../map/urls';
import type { ServiceType } from './types';

/** A guess at the kind of service behind an address, from its shape alone. */
export function detectServiceType(url: string): ServiceType | undefined {
  const lower = url.trim().toLowerCase();
  const path = lower.split(/[?#]/)[0]!.replace(/\/+$/, '');
  const service = getParam(url, 'SERVICE')?.toUpperCase();
  const template = /\{(z|x|y|-y|q|quadkey|zoom|bbox-epsg-3857)\}/.test(lower);
  if (lower.startsWith('pmtiles://') || path.endsWith('.pmtiles')) return 'pmtiles';
  if (template && /\.(pbf|mvt)$/.test(path)) return 'vector-tiles';
  if (template) return 'xyz';
  if (/\/tiles?\.json$/.test(path)) return 'vector-tiles';
  if (service === 'WMTS' || path.endsWith('wmtscapabilities.xml')) return 'wmts';
  if (service === 'WMS' || path.endsWith('/wmsserver')) return 'wms';
  if (service === 'WFS' || path.endsWith('/wfsserver')) return 'wfs';
  if (/\/collections(\/[^/]+(\/items)?)?$/.test(path)) return 'ogc-features';
  if (/\/featureserver(\/\d+)?$/.test(path) || /\/mapserver\/\d+$/.test(path)) return 'arcgis-features';
  if (path.endsWith('/mapserver')) return 'arcgis-mapserver';
  if (path.endsWith('.pdf')) return 'geopdf';
  if (/\.tiff?$/.test(path)) return 'cog';
  if (path.endsWith('.geojson')) return 'geojson';
  if (path.endsWith('style.json') || /\/styles?\//.test(path)) return 'style';
  return undefined;
}
