import { scaleToZoom, validBounds, WEB_MERCATOR_CODES } from '../geo/mercator';
import type { Bounds } from '../model/layer';
import type { Offer, ServiceInfo } from './types';
import { child, children, parseXml, text, xlinkHref } from './xml';

/** Names services use for Web Mercator, in the order they are preferred. */
const MERCATOR_CRS = [...WEB_MERCATOR_CODES.map((code) => `EPSG:${code}`), 'OSGEO:41001'];

/** Image formats in the order they are preferred: transparency first. */
const FORMATS = ['image/png', 'image/png8', 'image/png; mode=8bit', 'image/webp', 'image/gif', 'image/jpeg'];

/** What a layer takes over from the layers it is nested in. */
interface Inherited {
  crs: Set<string>;
  bounds?: Bounds;
  minScale?: number;
  maxScale?: number;
  attribution?: string;
}

/** Reads a WMS 1.1.1 or 1.3.0 capabilities document. */
export function parseWms(xml: string, capabilitiesUrl: string): ServiceInfo {
  const root = parseXml(xml);
  if (root.localName !== 'WMS_Capabilities' && root.localName !== 'WMT_MS_Capabilities') {
    throw new Error('This is not a WMS capabilities document.');
  }
  const version = root.getAttribute('version') === '1.3.0' ? '1.3.0' : '1.1.1';
  const capability = child(root, 'Capability');
  const getMap = child(capability, 'Request', 'GetMap');
  const url = xlinkHref(child(getMap, 'DCPType', 'HTTP', 'Get', 'OnlineResource')) ?? capabilitiesUrl;
  const formats = getMap ? children(getMap, 'Format').map((f) => f.textContent?.trim() ?? '') : [];
  const format = FORMATS.find((f) => formats.includes(f)) ?? formats.find((f) => f.startsWith('image/')) ?? 'image/png';

  const offers: Offer[] = [];
  const visit = (layer: Element, depth: number, parent: Inherited) => {
    const own = inherit(layer, parent, version);
    const name = text(layer, 'Name');
    const title = text(layer, 'Title') ?? name ?? 'Untitled layer';
    const offer: Offer = { title, depth, ...(name && { name }), ...describe(text(layer, 'Abstract')) };
    if (name) {
      const crs = MERCATOR_CRS.find((c) => own.crs.has(c));
      if (crs) {
        offer.draft = {
          name: title,
          source: { type: 'wms', url, version, layers: name, styles: '', format, crs },
          ...(own.bounds && { bounds: own.bounds }),
          ...(own.maxScale && { minzoom: Math.max(0, Math.floor(scaleToZoom(own.maxScale) * 10) / 10) }),
          ...(own.minScale && { maxzoom: Math.min(24, Math.ceil(scaleToZoom(own.minScale) * 10) / 10) }),
          ...(own.attribution && { attribution: own.attribution }),
        };
      } else {
        offer.reason = 'Not offered in Web Mercator (EPSG:3857).';
      }
    }
    offers.push(offer);
    for (const sub of children(layer, 'Layer')) visit(sub, depth + 1, own);
  };
  for (const top of capability ? children(capability, 'Layer') : []) visit(top, 0, { crs: new Set() });

  return {
    title: text(root, 'Service', 'Title') ?? 'WMS',
    ...describe(text(root, 'Service', 'Abstract')),
    offers,
  };
}

function describe(abstract: string | undefined): { description?: string } {
  return abstract ? { description: abstract } : {};
}

function inherit(layer: Element, parent: Inherited, version: string): Inherited {
  const crs = new Set(parent.crs);
  for (const element of [...children(layer, 'CRS'), ...children(layer, 'SRS')]) {
    // 1.1.1 allows several codes in one element, separated by spaces.
    for (const code of element.textContent?.trim().split(/\s+/) ?? []) crs.add(code.toUpperCase());
  }
  const own: Inherited = { ...parent, crs };
  const bounds = layerBounds(layer);
  if (bounds) own.bounds = bounds;
  const attribution = text(layer, 'Attribution', 'Title');
  if (attribution) own.attribution = attribution;

  if (version === '1.3.0') {
    const min = Number(text(layer, 'MinScaleDenominator'));
    const max = Number(text(layer, 'MaxScaleDenominator'));
    if (min > 0) own.minScale = min;
    if (max > 0) own.maxScale = max;
  } else {
    // 1.1.1 gives the ground size of a pixel's diagonal instead of a scale.
    const hint = child(layer, 'ScaleHint');
    const toScale = (value: string | null) => (Number(value) > 0 ? Number(value) / Math.SQRT2 / 0.00028 : undefined);
    const min = toScale(hint?.getAttribute('min') ?? null);
    const max = toScale(hint?.getAttribute('max') ?? null);
    if (min) own.minScale = min;
    if (max && Number.isFinite(max)) own.maxScale = max;
  }
  return own;
}

function layerBounds(layer: Element): Bounds | undefined {
  const geographic = child(layer, 'EX_GeographicBoundingBox');
  if (geographic) {
    const value = (name: string) => Number(text(geographic, name));
    return validBounds(
      value('westBoundLongitude'),
      value('southBoundLatitude'),
      value('eastBoundLongitude'),
      value('northBoundLatitude'),
    );
  }
  const latLon = child(layer, 'LatLonBoundingBox');
  if (latLon) {
    const value = (name: string) => Number(latLon.getAttribute(name));
    return validBounds(value('minx'), value('miny'), value('maxx'), value('maxy'));
  }
  return undefined;
}
