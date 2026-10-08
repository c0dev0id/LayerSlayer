import { HALF_WORLD, tileZoom, WEB_MERCATOR_CODES } from '../geo/mercator';
import { withParams } from '../map/urls';
import type { Offer, ServiceInfo } from './types';
import { child, children, descendants, parseXml, text, wgs84Bounds, xlinkHref } from './xml';

/** A tile matrix set that lines up with Web Mercator tiles: matrix identifiers by tile zoom. */
interface MercatorSet {
  matrices: Record<string, string>;
  tileSize: number;
}

const MERCATOR_CODE = new RegExp(`(?:^|\\D)(${WEB_MERCATOR_CODES.join('|')})$`);

/** Formats in the order they are preferred: transparency first. */
const FORMATS = ['image/png', 'image/png8', 'image/webp', 'image/jpeg'];

/** Reads a WMTS 1.0.0 capabilities document. */
export function parseWmts(xml: string, capabilitiesUrl: string): ServiceInfo {
  const root = parseXml(xml);
  if (root.localName !== 'Capabilities' || !child(root, 'Contents')) {
    throw new Error('This is not a WMTS capabilities document.');
  }
  const contents = child(root, 'Contents')!;
  const sets = new Map<string, MercatorSet | undefined>();
  for (const set of children(contents, 'TileMatrixSet')) {
    const id = text(set, 'Identifier');
    if (id) sets.set(id, mercatorSet(set));
  }
  // Without an operations section, a KVP capabilities address is the service's KVP endpoint too.
  const kvpUrl = getTileKvpUrl(root) ?? (capabilitiesUrl.includes('?') ? capabilitiesUrl : undefined);

  const offers: Offer[] = children(contents, 'Layer').map((layer) => {
    const id = text(layer, 'Identifier') ?? '';
    const title = text(layer, 'Title') ?? id;
    const offer: Offer = { title, name: id, depth: 0 };
    const abstract = text(layer, 'Abstract');
    if (abstract) offer.description = abstract;

    const links = children(layer, 'TileMatrixSetLink');
    const link = links.find((l) => sets.get(text(l, 'TileMatrixSet') ?? ''));
    if (!link) {
      const linked = links.map((l) => text(l, 'TileMatrixSet')).join(', ');
      offer.reason = `No tile matrix set in Web Mercator (has ${linked || 'none'}).`;
      return offer;
    }
    const setId = text(link, 'TileMatrixSet')!;
    const set = sets.get(setId)!;
    const template = tileTemplate(layer, id, setId, kvpUrl);
    if (!template) {
      offer.reason = 'The service names no address for its tiles.';
      return offer;
    }
    const bounds = wgs84Bounds(layer);
    offer.draft = {
      name: title,
      source: { type: 'wmts', template, matrices: limitMatrices(set.matrices, link), tileSize: set.tileSize },
      ...(bounds && { bounds }),
    };
    return offer;
  });

  const description = text(root, 'ServiceIdentification', 'Abstract');
  return {
    title: text(root, 'ServiceIdentification', 'Title') ?? 'WMTS',
    ...(description && { description }),
    offers,
  };
}

/** The matrices a layer has tiles in, where its link to the set limits them. */
function limitMatrices(matrices: Record<string, string>, link: Element): Record<string, string> {
  const limits = child(link, 'TileMatrixSetLimits');
  if (!limits) return matrices;
  const allowed = new Set(children(limits, 'TileMatrixLimits').map((l) => text(l, 'TileMatrix')));
  const limited = Object.fromEntries(Object.entries(matrices).filter(([, id]) => allowed.has(id)));
  return Object.keys(limited).length > 0 ? limited : matrices;
}

/**
 * The set's matrices by tile zoom, if the set is Web Mercator with its origin in the
 * world's top left corner, one tile size, and each matrix at a whole zoom's resolution.
 */
export function mercatorSet(set: Element): MercatorSet | undefined {
  if (!MERCATOR_CODE.test(text(set, 'SupportedCRS') ?? '')) return undefined;
  const matrices: Record<string, string> = {};
  let tileSize: number | undefined;
  for (const matrix of children(set, 'TileMatrix')) {
    const id = text(matrix, 'Identifier');
    const scale = Number(text(matrix, 'ScaleDenominator'));
    const width = Number(text(matrix, 'TileWidth'));
    const height = Number(text(matrix, 'TileHeight'));
    const [x, y] = (text(matrix, 'TopLeftCorner') ?? '').split(/\s+/).map(Number);
    if (!id || !(scale > 0) || width !== height) return undefined;
    if (Math.abs(x! + HALF_WORLD) > 1 || Math.abs(y! - HALF_WORLD) > 1) return undefined;
    if (tileSize !== undefined && tileSize !== width) return undefined;
    tileSize = width;
    const z = tileZoom(scale * 0.00028, width);
    if (z === undefined) return undefined;
    matrices[String(z)] ??= id;
  }
  return tileSize ? { matrices, tileSize } : undefined;
}

/**
 * The layer's tile URL with {TileMatrix}, {TileRow} and {TileCol} left in and everything
 * else filled: the matrix set, the default style and the default of each dimension.
 * RESTful templates are preferred over the KVP GetTile endpoint.
 */
function tileTemplate(layer: Element, id: string, setId: string, kvpUrl: string | undefined): string | undefined {
  const formats = children(layer, 'Format').map((f) => f.textContent?.trim() ?? '');
  const resources = children(layer, 'ResourceURL').filter((r) => r.getAttribute('resourceType') === 'tile');
  const resource =
    FORMATS.map((f) => resources.find((r) => r.getAttribute('format') === f)).find(Boolean) ?? resources[0];
  const style = defaultStyle(layer);
  let template = resource?.getAttribute('template');
  if (!template && kvpUrl) {
    const format = FORMATS.find((f) => formats.includes(f)) ?? formats[0] ?? 'image/png';
    template = withParams(kvpUrl, {
      SERVICE: 'WMTS',
      REQUEST: 'GetTile',
      VERSION: '1.0.0',
      LAYER: id,
      STYLE: style,
      FORMAT: format,
      TILEMATRIXSET: setId,
      TILEMATRIX: '{TileMatrix}',
      TILEROW: '{TileRow}',
      TILECOL: '{TileCol}',
    });
  }
  if (!template) return undefined;
  const values = new Map<string, string>([
    ['tilematrixset', setId],
    ['style', style],
    ...children(layer, 'Dimension').map((d): [string, string] => [
      (text(d, 'Identifier') ?? '').toLowerCase(),
      text(d, 'Default') ?? text(d, 'Value') ?? '',
    ]),
  ]);
  const canonical: Record<string, string> = { tilematrix: '{TileMatrix}', tilerow: '{TileRow}', tilecol: '{TileCol}' };
  return template.replace(/\{([^}]+)\}/g, (token, name: string) => {
    const key = name.toLowerCase();
    return canonical[key] ?? values.get(key) ?? token;
  });
}

function defaultStyle(layer: Element): string {
  const styles = children(layer, 'Style');
  const style = styles.find((s) => s.getAttribute('isDefault') === 'true') ?? styles[0];
  return text(style, 'Identifier') ?? 'default';
}

function getTileKvpUrl(root: Element): string | undefined {
  const operation = descendants(root, 'Operation').find((o) => o.getAttribute('name') === 'GetTile');
  if (!operation) return undefined;
  const gets = descendants(operation, 'Get');
  const kvp = gets.find((g) => descendants(g, 'AllowedValues').some((a) => /KVP/i.test(a.textContent ?? '')));
  // A Get without an encoding constraint accepts KVP by default.
  const get = kvp ?? gets.find((g) => descendants(g, 'Constraint').length === 0);
  return xlinkHref(get);
}

