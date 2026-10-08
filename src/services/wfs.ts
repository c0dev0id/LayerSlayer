import { validBounds } from '../geo/mercator';
import type { Bounds } from '../model/layer';
import { FEATURE_MINZOOM, type Offer, type ServiceInfo } from './types';
import { child, children, descendants, parseXml, text, xlinkHref } from './xml';

/** Most features asked for per tile, unless the server allows fewer. */
export const WFS_MAX_FEATURES = 2000;

/**
 * Spellings of GeoJSON among GetFeature output formats, preferred first. JSON-FG and
 * `text/javascript` (JSONP) are left out.
 */
const GEOJSON_FORMATS = ['application/json', 'application/geo+json', 'application/json; subtype=geojson', 'application/vnd.geo+json', 'geojson', 'json'];

/** The server's own spelling of the first GeoJSON format it offers. */
export function geojsonFormat(formats: readonly string[]): string | undefined {
  const offered = formats.map((f) => f.trim()).filter(Boolean);
  for (const wanted of GEOJSON_FORMATS) {
    const found = offered.find((f) => f.toLowerCase().replace(/\s+/g, ' ') === wanted);
    if (found) return found;
  }
  return undefined;
}

function operation(root: Element, name: string): Element | undefined {
  return descendants(root, 'Operation').find((op) => op.getAttribute('name') === name);
}

/** Values of an operation's parameter or constraint, whether listed as AllowedValues or plain Values (OWS 1.0). */
function values(element: Element | undefined, kind: 'Parameter' | 'Constraint', name: string): string[] {
  if (!element) return [];
  const entry = children(element, kind).find((p) => p.getAttribute('name')?.toLowerCase() === name.toLowerCase());
  if (!entry) return [];
  return [...descendants(entry, 'Value'), ...descendants(entry, 'DefaultValue')].map((v) => v.textContent?.trim() ?? '').filter(Boolean);
}

function wgs84Bounds(featureType: Element): Bounds | undefined {
  const box = child(featureType, 'WGS84BoundingBox');
  const [west, south] = (text(box, 'LowerCorner') ?? '').split(/\s+/).map(Number);
  const [east, north] = (text(box, 'UpperCorner') ?? '').split(/\s+/).map(Number);
  return west !== undefined && south !== undefined && east !== undefined && north !== undefined ? validBounds(west, south, east, north) : undefined;
}

/**
 * Reads WFS 2.0 or 1.1 capabilities. Each feature type is offered as a layer queried per
 * tile for GeoJSON at the GetFeature address the server names; types are offered from
 * FEATURE_MINZOOM, since a feature count per type would cost a request each.
 */
export function parseWfs(xml: string, capabilitiesUrl: string): ServiceInfo {
  const root = parseXml(xml);
  if (root.localName !== 'WFS_Capabilities') throw new Error('The service did not answer with WFS capabilities.');
  const version = root.getAttribute('version');
  if (version !== '2.0.0' && version !== '1.1.0') {
    throw new Error(`The service speaks WFS ${version ?? 'of an unknown version'}; webmap reads WFS 2.0 and 1.1.`);
  }
  const getFeature = operation(root, 'GetFeature');
  const url = xlinkHref(descendants(getFeature ?? root, 'Get')[0]) ?? capabilitiesUrl.split('?')[0]!;
  const formats = values(getFeature, 'Parameter', 'outputFormat');
  const countDefault = Number(values(getFeature, 'Constraint', 'CountDefault')[0] ?? values(child(root, 'OperationsMetadata'), 'Constraint', 'CountDefault')[0]);
  const maxFeatures = countDefault > 0 ? Math.min(WFS_MAX_FEATURES, countDefault) : WFS_MAX_FEATURES;
  const provider = text(root, 'ServiceProvider', 'ProviderName');
  const description = text(root, 'ServiceIdentification', 'Abstract');
  const types = children(child(root, 'FeatureTypeList') ?? root, 'FeatureType');
  return {
    title: text(root, 'ServiceIdentification', 'Title') ?? provider ?? 'WFS',
    ...(description && { description }),
    offers: types.flatMap((featureType): Offer[] => {
      const typeName = text(featureType, 'Name');
      if (!typeName) return [];
      const title = text(featureType, 'Title') ?? typeName;
      const abstract = text(featureType, 'Abstract');
      const offer: Offer = { title, name: typeName, depth: 0, ...(abstract && { description: abstract }) };
      // WFS 1.1 may list formats per type; a server that lists none at all is asked for application/json.
      const own = children(child(featureType, 'OutputFormats') ?? featureType, 'Format').map((f) => f.textContent ?? '');
      const listed = [...own, ...formats];
      const outputFormat = listed.length > 0 ? geojsonFormat(listed) : 'application/json';
      if (!outputFormat) return [{ ...offer, reason: 'The server cannot answer in GeoJSON.' }];
      const bounds = wgs84Bounds(featureType);
      offer.draft = {
        name: title,
        source: { type: 'wfs', url, version, typeName, outputFormat, maxFeatures },
        minzoom: FEATURE_MINZOOM,
        ...(bounds && { bounds }),
        ...(provider && { attribution: provider }),
      };
      return [offer];
    }),
  };
}
