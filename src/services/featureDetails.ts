import { isDataProperty } from './featureProperties';
import { readClosure, type Closure } from './roadClosures';

/** One line of what a feature is: a property name and its value, both as text. */
export interface FeatureRow {
  label: string;
  value: string;
}

/** A feature of a layer in words: its name or kind, the name as written where read further, and its properties. */
export interface FeatureDescription {
  title: string;
  subtitle?: string;
  rows: FeatureRow[];
}

/** Properties that name a feature, most common first. */
const NAME_KEYS = ['name', 'Name', 'NAME', 'title', 'Title', 'TITLE'];

/**
 * A feature in words. Its name is the title and its other properties are the rows, left
 * out where empty or where they say how it was drawn. The road closures of mintelonline.de
 * are read from their names instead.
 */
export function describeFeature(properties: Record<string, unknown> | null, fallbackTitle: string): FeatureDescription {
  const props = properties ?? {};
  const closure = readClosure(props);
  if (closure) return describeClosure(closure, props);
  const nameKey = NAME_KEYS.find((k) => typeof props[k] === 'string' && props[k] !== '');
  const rows = Object.entries(props)
    .filter(([key]) => key !== nameKey && isDataProperty(key))
    .map(([label, value]) => ({ label, value: valueText(value) }))
    .filter((row) => row.value !== '');
  return { title: nameKey ? (props[nameKey] as string) : fallbackTitle, rows };
}

function describeClosure(closure: Closure & { allVehicles: boolean }, props: Record<string, unknown>): FeatureDescription {
  const rows: FeatureRow[] = [];
  const [first, second] = closure.places;
  // A route names one place where it is closed one way only; the names of signs say nothing of directions.
  if (closure.postcode && second) rows.push({ label: 'Closed', value: `both ways, between ${first} and ${closure.places.slice(1).join(', ')}` });
  else if (closure.postcode) rows.push({ label: 'Closed', value: `one way only, ${first}` });
  else rows.push({ label: closure.places.length > 1 ? 'Places' : 'Place', value: closure.places.join(', ') });
  rows.push({ label: 'When', value: closure.when || 'always' });
  if (closure.loud) rows.push({ label: 'Only', value: 'motorcycles louder than 95 dB standing noise' });
  if (closure.postcode) rows.push({ label: 'Postcode', value: `${closure.postcode}, ${closure.country}` });
  const note = valueText(props['description']);
  if (note) rows.push({ label: 'Note', value: note });
  return {
    title: closure.allVehicles ? 'Closed to all motor vehicles' : 'Closed to motorcycles',
    subtitle: props['name'] as string,
    rows,
  };
}

/** A property value as text: HTML (as in KML descriptions) as its text, lines joined; nothing for empty values. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  let text = String(value);
  if (/<[a-z][^>]*>/i.test(text)) text = new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent ?? '';
  return text
    .split(/\s*\n\s*/)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
