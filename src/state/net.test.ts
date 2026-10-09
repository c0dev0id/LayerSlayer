import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLoadError, fetchResource, proxyTarget, requestUrl, setProxy, statusMessage } from './net';

describe('requestUrl', () => {
  afterEach(() => setProxy('', []));

  it('upgrades plain HTTP on an HTTPS page', () => {
    expect(requestUrl('http://a.example/x', 'https:')).toBe('https://a.example/x');
    expect(requestUrl('http://a.example/x', 'http:')).toBe('http://a.example/x');
    expect(requestUrl('blob:abc', 'https:')).toBe('blob:abc');
  });

  it('sends proxied hosts through the proxy, encoded where the template says', () => {
    setProxy('https://p.example/?url={url}', ['a.example']);
    expect(requestUrl('http://a.example/x?y=1&z=2', 'https:')).toBe(
      'https://p.example/?url=http%3A%2F%2Fa.example%2Fx%3Fy%3D1%26z%3D2',
    );
    expect(requestUrl('https://b.example/x', 'https:')).toBe('https://b.example/x');
    setProxy('https://p.example/', ['a.example']);
    expect(requestUrl('https://a.example/x?y=1', 'https:')).toBe('https://p.example/https://a.example/x?y=1');
  });

  it('ignores the host list while no proxy is set', () => {
    setProxy('', ['a.example']);
    expect(requestUrl('https://a.example/x', 'https:')).toBe('https://a.example/x');
  });
});

describe('error messages', () => {
  afterEach(() => setProxy('', []));
  const proxy = 'https://p.example/?key=secret&url={url}';

  it('find the address a proxied request is for', () => {
    setProxy(proxy, ['a.example']);
    const sent = requestUrl('https://a.example/wms?x=1&y=2', 'https:');
    expect(proxyTarget(sent)).toBe('https://a.example/wms?x=1&y=2');
    expect(proxyTarget('https://a.example/wms')).toBeUndefined();
    setProxy('https://p.example/', ['a.example']);
    expect(proxyTarget('https://p.example/https://a.example/x')).toBe('https://a.example/x');
  });

  it("name the proxy and its reason, but never the proxy's address", () => {
    setProxy(proxy, ['a.example']);
    const sent = requestUrl('https://a.example/tile.png', 'https:');
    const message = statusMessage(sent, 403, '{"error":"This content type is not available on the Free plan"}');
    expect(message).toBe('The CORS proxy answered 403 for a.example: This content type is not available on the Free plan');
    expect(message).not.toContain('secret');
  });

  it("give a server's own reason, and leave out HTML pages", () => {
    expect(statusMessage('https://a.example/x', 500, '{"error":{"message":"Token required"}}')).toBe('a.example answered 500: Token required');
    expect(statusMessage('https://a.example/x', 404, 'Not found')).toBe('a.example answered 404: Not found');
    expect(statusMessage('https://a.example/x', 403, '<!DOCTYPE html><html>…')).toBe('a.example answered 403.');
    expect(statusMessage('https://a.example/x', 429, '<html>rate_limited</html>')).toBe(
      'a.example answered 429: too many requests from this address. Try again in a minute.',
    );
    expect(statusMessage('https://a.example/x', 504, '')).toBe('a.example answered 504: the service is overloaded or too slow to answer. Try again later.');
    expect(statusMessage('https://a.example/x', 503, 'Down for maintenance')).toBe('a.example answered 503: Down for maintenance');
    const report = '<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1"><ows:Exception><ows:ExceptionText>TileRow out of range</ows:ExceptionText></ows:Exception></ows:ExceptionReport>';
    expect(statusMessage('https://a.example/x', 400, report)).toBe('a.example answered 400: TileRow out of range');
  });

  it('call a request without an answer unreachable or refused by CORS', () => {
    expect(statusMessage('https://a.example/x', 0, '')).toBe('a.example could not be read: it is unreachable or does not allow this page to read it (CORS).');
    setProxy(proxy, ['a.example']);
    expect(statusMessage(requestUrl('https://a.example/x', 'https:'), 0, '')).toBe('The CORS proxy could not be reached for a.example.');
  });

  it('read the status, address and body of a failed map request', async () => {
    const error = { status: 404, url: 'https://a.example/1/2/3.png', body: new Blob(['No tile here']), message: 'AJAXError' };
    expect(await describeLoadError(error)).toBe('a.example answered 404: No tile here');
    expect(await describeLoadError(new Error('Could not decode image'))).toBe('Could not decode image');
  });
});

describe('fetchResource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says a server did not answer in time, rather than that it cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new DOMException('signal timed out', 'TimeoutError')));
    await expect(fetchResource('https://postpass.example/api')).rejects.toThrow('postpass.example did not answer in time.');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(fetchResource('https://postpass.example/api')).rejects.toThrow('could not be read');
  });
});
