import { getParam, withParams } from '../map/urls';
import { fetchResource } from '../state/net';
import { parseFeatureService, parseMapServer, serviceUrl, type FeatureLayer, type LayerDetails } from './arcgis';
import { collectionsAddress, landingPageCollections, parseCollections } from './ogcFeatures';
import { loadStyle } from './style';
import type { ServiceInfo, ServiceType } from './types';
import { parseWfs } from './wfs';
import { parseWms } from './wms';
import { parseWmts } from './wmts';
import { parseXyz } from './xyz';

/** Reads what a service offers. GeoPDF addresses are imported as files instead. */
export async function readService(type: Exclude<ServiceType, 'geopdf'>, url: string): Promise<ServiceInfo> {
  switch (type) {
    case 'wms': {
      const caps = wmsCapabilitiesUrl(url);
      return parseWms(await (await fetchResource(caps)).text(), caps);
    }
    case 'wmts': {
      const restful = /wmtscapabilities\.xml/i.test(url.split('?')[0]!);
      const caps = restful || getParam(url, 'REQUEST') ? url : withParams(url, { SERVICE: 'WMTS', REQUEST: 'GetCapabilities' });
      return parseWmts(await (await fetchResource(caps)).text(), caps);
    }
    case 'wfs': {
      const caps = withParams(url, { SERVICE: 'WFS', REQUEST: 'GetCapabilities', ACCEPTVERSIONS: '2.0.0,1.1.0' });
      return parseWfs(await (await fetchResource(caps)).text(), caps);
    }
    case 'ogc-features':
      return readOgcFeatures(url);
    case 'arcgis-mapserver':
      return parseMapServer(await (await fetchResource(withParams(serviceUrl(url), { f: 'json' }))).json(), url);
    case 'arcgis-features':
      return readFeatureService(url);
    case 'xyz':
      return parseXyz(url);
    case 'geojson': {
      const name = fileName(url);
      return { title: name, offers: [{ title: name, depth: 0, draft: { name, source: { type: 'geojson', data: { url } } } }] };
    }
    case 'style': {
      const style = await loadStyle(url);
      const name = style.name ?? fileName(url);
      return { title: name, offers: [{ title: name, depth: 0, draft: { name, source: { type: 'style', url } } }] };
    }
  }
}

/**
 * A WMS capabilities request. Version 1.3.0 is asked for unless the address names one, as
 * other clients do: a server without it answers in 1.1.1, and some (MapServer) send 1.1.1
 * documents as application/vnd.ogc.wms_xml, which CORS proxies treat as binary.
 */
export function wmsCapabilitiesUrl(url: string): string {
  return withParams(url, { SERVICE: 'WMS', REQUEST: 'GetCapabilities', ...(!getParam(url, 'VERSION') && { VERSION: '1.3.0' }) });
}

async function fetchJson<T>(url: string): Promise<T> {
  return (await fetchResource(url)).json() as Promise<T>;
}

/** OGC APIs answer HTML to a browser's default Accept header. */
const ACCEPT_JSON = { headers: { Accept: 'application/json' } };

/** Reads an OGC API's collections from its landing page, its collections or one collection. */
async function readOgcFeatures(url: string): Promise<ServiceInfo> {
  const address = collectionsAddress(url) ?? { collections: landingPageCollections(await (await fetchResource(url, ACCEPT_JSON)).json(), url) };
  return parseCollections(await (await fetchResource(address.collections, ACCEPT_JSON)).json(), address.collections, address.id);
}

/**
 * Reads a FeatureServer or one of its layers, and each feature layer's own description and
 * feature count, which the service listing lacks. Those are best effort: a layer whose
 * details fail is offered with what the service says.
 */
async function readFeatureService(url: string): Promise<ServiceInfo> {
  const base = serviceUrl(url);
  const json = await fetchJson<FeatureLayer & { layers?: FeatureLayer[] }>(withParams(base, { f: 'json' }));
  const single = typeof json.id === 'number' && 'geometryType' in json && !Array.isArray(json.layers);
  const layers: [number, string, FeatureLayer | undefined][] = single
    ? [[json.id, base, json]]
    : (json.layers ?? []).filter((l) => l.geometryType).map((l) => [l.id, `${base}/${l.id}`, undefined]);
  const details = await Promise.all(
    layers.map(async ([id, layerUrl, known]): Promise<[number, LayerDetails]> => {
      const [layer, count] = await Promise.all([
        known ?? fetchJson<FeatureLayer>(withParams(layerUrl, { f: 'json' })).catch(() => undefined),
        fetchJson<{ count?: number }>(withParams(`${layerUrl}/query`, { where: '1=1', returnCountOnly: 'true', f: 'json' }))
          .then((r) => r.count)
          .catch(() => undefined),
      ]);
      return [id, { ...(layer && !layer.error && { layer }), ...(count !== undefined && { count }) }];
    }),
  );
  return parseFeatureService(json, url, new Map(details));
}

/** The last part of an address's path, without its extension. */
export function fileName(url: string): string {
  const segment = url.split(/[?#]/)[0]!.replace(/\/+$/, '').split('/').pop() ?? url;
  return decodeURIComponent(segment).replace(/\.[a-z0-9]+$/i, '') || url;
}
