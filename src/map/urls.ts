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
