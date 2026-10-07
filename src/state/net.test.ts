import { afterEach, describe, expect, it } from 'vitest';
import { requestUrl, setProxy } from './net';

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
