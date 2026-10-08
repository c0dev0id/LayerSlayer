/** Namespace-agnostic reading of OGC capabilities documents. */

export function parseXml(text: string, unreadable = 'The service did not answer with a readable XML document.'): Element {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(unreadable);
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
