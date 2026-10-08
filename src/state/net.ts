import { exceptionText } from '../services/xml';

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

/** The address a request through the proxy is for, or undefined when it does not go through it. */
export function proxyTarget(url: string): string | undefined {
  if (!proxyTemplate) return undefined;
  const at = proxyTemplate.indexOf('{url}');
  if (at < 0) return url.startsWith(proxyTemplate) ? url.slice(proxyTemplate.length) : undefined;
  const prefix = proxyTemplate.slice(0, at);
  const suffix = proxyTemplate.slice(at + '{url}'.length);
  if (!url.startsWith(prefix) || !url.endsWith(suffix)) return undefined;
  try {
    return decodeURIComponent(url.slice(prefix.length, url.length - suffix.length));
  } catch {
    return undefined;
  }
}

/**
 * Why a request answered with an error status, in words: who answered (the server, or the
 * proxy on its behalf) and the reason the answer gives, where it gives one as text or as a
 * JSON `error` or `message`. HTML pages are left out. The proxy's own address, which holds
 * any key it was given, is never shown.
 */
export function statusMessage(url: string, status: number, body: string): string {
  const target = proxyTarget(url);
  const host = hostOf(target ?? url) ?? url;
  // Status 0 is a request that got no answer the page may read: refused, unreachable or CORS.
  if (status === 0) {
    return target
      ? `The CORS proxy could not be reached for ${host}.`
      : `${host} could not be read: it is unreachable or does not allow this page to read it (CORS).`;
  }
  const who = target ? `The CORS proxy answered ${status} for ${host}` : `${host} answered ${status}`;
  const reason = answerReason(body);
  return reason ? `${who}: ${reason}` : `${who}.`;
}

function answerReason(body: string): string | undefined {
  const text = body.trim();
  if (!text) return undefined;
  // OGC services report errors in XML; other markup is an HTML error page, of no use here.
  if (text.startsWith('<')) return exceptionText(text);
  try {
    const json = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
    const reason = typeof json.error === 'string' ? json.error : (json.error?.message ?? json.message);
    return typeof reason === 'string' ? reason : undefined;
  } catch {
    return text.length <= 200 ? text : undefined;
  }
}

/** A readable message for a failed load, as the map reports it (MapLibre's AJAXError carries status, URL and body). */
export async function describeLoadError(error: unknown): Promise<string> {
  const e = error as { status?: unknown; url?: unknown; body?: unknown; message?: unknown } | undefined;
  if (typeof e?.status === 'number' && typeof e.url === 'string') {
    const body = e.body instanceof Blob && e.body.size < 10_000 ? await e.body.text().catch(() => '') : '';
    return statusMessage(e.url, e.status, body);
  }
  return typeof e?.message === 'string' ? e.message : 'The layer could not be loaded.';
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
  if (!response.ok) {
    const sent = requestUrl(url);
    throw new Error(statusMessage(sent, response.status, await response.text().catch(() => '')));
  }
  return response;
}
