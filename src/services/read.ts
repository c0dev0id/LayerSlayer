import { getParam, withParams } from '../map/urls';
import { fetchResource } from '../state/net';
import { parseFeatureService, parseMapServer, serviceUrl, type FeatureLayer, type LayerDetails } from './arcgis';
import { loadStyle } from './style';
import type { ServiceInfo, ServiceType } from './types';
import { parseWms } from './wms';
import { parseWmts } from './wmts';
import { parseXyz } from './xyz';

/** Reads what a service offers. GeoPDF addresses are imported as files instead. */
export async function readService(type: Exclude<ServiceType, 'geopdf'>, url: string): Promise<ServiceInfo> {
  switch (type) {
    case 'wms': {
      const caps = withParams(url, { SERVICE: 'WMS', REQUEST: 'GetCapabilities' });
      return parseWms(await (await fetchResource(caps)).text(), caps);
    }
    case 'wmts': {
      const restful = /wmtscapabilities\.xml/i.test(url.split('?')[0]!);
      const caps = restful || getParam(url, 'REQUEST') ? url : withParams(url, { SERVICE: 'WMTS', REQUEST: 'GetCapabilities' });
      return parseWmts(await (await fetchResource(caps)).text(), caps);
    }
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

async function fetchJson<T>(url: string): Promise<T> {
  return (await fetchResource(url)).json() as Promise<T>;
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
