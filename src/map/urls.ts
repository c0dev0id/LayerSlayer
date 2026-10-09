/**
 * Encodes a query value but leaves MapLibre's placeholders like {bbox-epsg-3857} as they
 * are, since the map fills them in per tile. Commas, colons and slashes stay readable.
 */
function encodeValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/%7B([A-Za-z0-9-]+)%7D/g, '{$1}')
    .replace(/%2C/gi, ',')
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/');
}

/**
 * Adds query parameters to a URL. Parameters already in it with the same name (ignoring
 * case, as OGC services do) are replaced, so a GetCapabilities address can be turned into a
 * GetMap request; everything else in the query is kept, since services put vendor
 * parameters and keys there.
 */
export function withParams(url: string, params: Record<string, string | number>): string {
  const hashAt = url.indexOf('#');
  const bare = hashAt < 0 ? url : url.slice(0, hashAt);
  const queryAt = bare.indexOf('?');
  const path = queryAt < 0 ? bare : bare.slice(0, queryAt);
  const query = queryAt < 0 ? '' : bare.slice(queryAt + 1);
  const replaced = new Set(Object.keys(params).map((k) => k.toUpperCase()));
  const kept = query
    .split('&')
    .filter((pair) => pair !== '' && !replaced.has(decodeURIComponent(pair.split('=')[0]!).toUpperCase()));
  const added = Object.entries(params).map(([k, v]) => `${k}=${encodeValue(String(v))}`);
  return `${path}?${[...kept, ...added].join('&')}`;
}

/** A query parameter's value, ignoring the case of its name. */
export function getParam(url: string, name: string): string | undefined {
  const query = url.split('#')[0]!.split('?')[1] ?? '';
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key && decodeURIComponent(key).toUpperCase() === name.toUpperCase()) {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  return undefined;
}

/**
 * Resolves a URL against the document it was found in. Placeholders survive: `new URL`
 * would percent-encode the braces of {z} or {fontstack} and the map could no longer fill
 * them in.
 */
export function resolveUrl(url: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  const tokens: string[] = [];
  const masked = url.replace(/\{[^}]*\}/g, (token) => `__token${tokens.push(token) - 1}__`);
  return new URL(masked, base).href.replace(/__token(\d+)__/g, (_, i: string) => tokens[Number(i)]!);
}

/**
 * Placeholders of a tile template as a browser copies an address, percent-encoded
 * (`%7Bz%7D`), back in braces; the rest of the address keeps its encoding.
 */
/** Whether an address is a template with placeholders such as {z}, rather than one to open. */
export function hasPlaceholders(url: string): boolean {
  return /\{[^{}]+\}/.test(url);
}

export function decodePlaceholders(url: string): string {
  return url.replace(/%7B([A-Za-z0-9_-]+)%7D/gi, '{$1}');
}

/** A tile address of one of the app's protocols, `scheme://{z}/{x}/{y}?params`, which the map fills in per tile. */
export function protocolTileUrl(scheme: string, params: Record<string, string>): string {
  return `${scheme}://{z}/{x}/{y}?${new URLSearchParams(params)}`;
}

/** The tile and parameters of a filled-in protocol tile address. */
export function parseProtocolTile(url: string): { z: number; x: number; y: number; params: URLSearchParams } {
  const match = /^[^:]+:\/\/(\d+)\/(\d+)\/(\d+)\?(.*)$/.exec(url);
  if (!match) throw new Error(`Not a protocol tile address: ${url}`);
  return { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]), params: new URLSearchParams(match[4]) };
}

/**
 * The scheme of tiles read from PMTiles archives, with the addresses the pmtiles library's
 * own protocol has, so that MapLibre styles written for it work too: the archive's address
 * follows the scheme, then the tile (`pmtiles://https://…/a.pmtiles/{z}/{x}/{y}`); the
 * archive alone (`pmtiles://https://…/a.pmtiles`) asks for its TileJSON.
 */
export const PMTILES_PROTOCOL = 'pmtiles';

/** The tile address of the tiles in a PMTiles archive. */
export function pmtilesTiles(archive: string): string {
  return `${PMTILES_PROTOCOL}://${archive}/{z}/{x}/{y}`;
}

const PMTILES_ADDRESS = new RegExp(`^${PMTILES_PROTOCOL}://(.+?)(?:/(\\d+|\\{z\\})/(\\d+|\\{x\\})/(\\d+|\\{y\\})(?:\\.\\w+)?)?$`);

/**
 * The archive a PMTiles address reads from, and the tile it asks for unless it is a template
 * or the archive's TileJSON. A tile may end in a file extension, as the library's TileJSON
 * writes them.
 */
export function parsePmtilesUrl(url: string): { archive: string; tile?: [z: number, x: number, y: number] } | undefined {
  const match = PMTILES_ADDRESS.exec(url);
  if (!match) return undefined;
  const tile = match.slice(2, 5).map(Number);
  return { archive: match[1]!, ...(tile.every(Number.isInteger) && { tile: tile as [number, number, number] }) };
}
