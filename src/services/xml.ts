import { validBounds } from '../geo/mercator';
import type { Bounds } from '../model/layer';

/** Namespace-agnostic reading of OGC capabilities documents. */

/** Parses an XML document; `root`, where given, is the local name its root element must have. */
export function parseXml(text: string, unreadable = 'The service did not answer with a readable XML document.', root?: string): Element {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error || (root && doc.documentElement.localName !== root)) throw new Error(unreadable);
  return doc.documentElement;
}

/** Direct children with the given local name, whatever their namespace prefix. */
export function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((c) => c.localName === name);
}

export function child(element: Element | undefined, ...path: string[]): Element | undefined {
  let current = element;
  for (const name of path) {
    if (!current) return undefined;
    current = children(current, name)[0];
  }
  return current;
}

/** Trimmed text of the element at `path`, or undefined when it is missing or empty. */
export function text(element: Element | undefined, ...path: string[]): string | undefined {
  const value = child(element, ...path)?.textContent?.trim();
  return value ? value : undefined;
}

export function descendants(element: Element, name: string): Element[] {
  return Array.from(element.getElementsByTagNameNS('*', name));
}

export function xlinkHref(element: Element | undefined): string | undefined {
  return element?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? element?.getAttribute('xlink:href') ?? undefined;
}

/** The bounds in an element's OWS WGS84BoundingBox (corners as "longitude latitude"). */
export function wgs84Bounds(element: Element): Bounds | undefined {
  const box = child(element, 'WGS84BoundingBox');
  if (!box) return undefined;
  const [west, south] = (text(box, 'LowerCorner') ?? '').split(/\s+/).map(Number);
  const [east, north] = (text(box, 'UpperCorner') ?? '').split(/\s+/).map(Number);
  return validBounds(west!, south!, east!, north!);
}

/**
 * The text of an OWS or WMS exception report, which OGC services send as XML whatever was
 * asked for, often with status 200.
 */
export function exceptionText(text: string): string | undefined {
  try {
    const root = parseXml(text);
    return [...descendants(root, 'ExceptionText'), ...descendants(root, 'ServiceException')][0]?.textContent?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** The text of HTML, as descriptions of services and features often are, with its line breaks as new lines. */
export function htmlText(html: string): string {
  return new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent ?? '';
}
