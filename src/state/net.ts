/**
 * How the app reaches other servers. Everything a layer loads goes through `requestUrl`:
 * the map's own requests by its transformRequest, the app's by `fetchResource`.
 */

let proxyTemplate = '';
let proxiedHosts = new Set<string>();

/**
 * Sets the CORS proxy and the hosts that need it. `template` holds {url} where the address
 * goes, percent-encoded; without {url} the address is appended as it is.
 */
export function setProxy(template: string, hosts: readonly string[]): void {
  proxyTemplate = template.trim();
  proxiedHosts = new Set(hosts);
}

export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** Whether requests to this URL's host go through the proxy. */
export function isProxied(url: string): boolean {
  const host = hostOf(url);
  return proxyTemplate !== '' && host !== undefined && proxiedHosts.has(host);
}

/**
 * The address a request is actually sent to. A proxied host goes through the proxy, which
 * can also reach a server that only speaks plain HTTP. Otherwise plain HTTP is upgraded on
 * a page served over HTTPS, where the browser would block it as mixed content.
 */
export function requestUrl(url: string, pageProtocol = globalThis.location?.protocol): string {
  if (!/^https?:/i.test(url)) return url;
  if (isProxied(url)) {
    return proxyTemplate.includes('{url}') ? proxyTemplate.replace('{url}', encodeURIComponent(url)) : proxyTemplate + url;
  }
  if (pageProtocol === 'https:' && /^http:/i.test(url)) return `https:${url.slice(5)}`;
  return url;
}

/** Fetches through `requestUrl`; a failed request or an error status becomes a readable Error. */
export async function fetchResource(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(requestUrl(url), init);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    const host = hostOf(url) ?? url;
    throw new Error(
      isProxied(url)
        ? `The CORS proxy did not answer for ${host}.`
        : `${host} could not be read: it is unreachable or does not allow this page to read it (CORS). ` +
            'Routing it through a CORS proxy (Settings) may help.',
      { cause: error },
    );
  }
  if (!response.ok) throw new Error(`${hostOf(url) ?? url} answered with status ${response.status}.`);
  return response;
}
