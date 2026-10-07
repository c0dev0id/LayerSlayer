import { getParam, withParams } from '../map/urls';
import { fetchResource } from '../state/net';
import { parseFeatureService, parseMapServer, serviceUrl } from './arcgis';
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
      return parseFeatureService(await (await fetchResource(withParams(serviceUrl(url), { f: 'json' }))).json(), url);
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

/** The last part of an address's path, without its extension. */
export function fileName(url: string): string {
  const segment = url.split(/[?#]/)[0]!.replace(/\/+$/, '').split('/').pop() ?? url;
  return decodeURIComponent(segment).replace(/\.[a-z0-9]+$/i, '') || url;
}
