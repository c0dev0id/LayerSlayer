/**
 * The road closures for motorcycles collected by mintelonline.de, whose route names say
 * what is closed: the postcode (A for Austria, CH or Ch for Switzerland, NL and B for the
 * Netherlands and Belgium, none for Germany), the dates, ">95dB" where only motorcycles
 * louder than 95 dB standing noise are meant, the days and hours, and the places the closure
 * runs between: "-A -B" closes the road both ways, a single "-A" one way only. The names of
 * the signs at the ends (waypoints) leave the postcode out. Some closures are for all motor
 * vehicles, which a sign's icon or the route's description says.
 *
 * https://www.mintelonline.de/streckensperrungen/
 */

export interface Closure {
  /** The country by the postcode's prefix; none where the name has no postcode, as a sign's. */
  country?: string;
  postcode?: string;
  /** When the closure applies, as written: dates, days and hours; empty for always. */
  when: string;
  /** Only motorcycles louder than 95 dB standing noise are kept out. */
  loud: boolean;
  /** The places named: two for a road closed both ways, one for a road closed one way. */
  places: string[];
}

const COUNTRIES: Record<string, string> = { '': 'Germany', A: 'Austria', CH: 'Switzerland', NL: 'Netherlands', B: 'Belgium' };

const POSTCODE = /^(A|CH|NL|B)?(\d{4,5})\s+/i;
/** A place begins with a hyphen after a space and before a letter; hyphens in dates, times and names do not. */
const PLACE = /(?:^|\s)-(?=[^\s\d-])/;
const LOUD = />\s*95\s*dB/i;

/** What a closure's name says, or nothing where the name does not read as one. */
export function parseClosureName(name: string): Closure | undefined {
  const text = name.trim().replace(/\s+/g, ' ');
  const code = POSTCODE.exec(text);
  const rest = code ? text.slice(code[0].length) : text;
  const start = PLACE.exec(rest);
  if (!start) return undefined;
  const places = rest
    .slice(start.index)
    .trim()
    .slice(1)
    .split(/ -(?=[^\s\d-])/)
    .map((p) => p.trim())
    .filter(Boolean);
  const conditions = rest.slice(0, start.index);
  const prefix = code?.[1]?.toUpperCase() ?? '';
  return {
    // German postcodes lose their leading zero in the names (1848 for 01848).
    ...(code && { country: COUNTRIES[prefix], postcode: prefix ? code[2]! : code[2]!.padStart(5, '0') }),
    when: conditions.replace(LOUD, '').replace(/\s+/g, ' ').trim(),
    loud: LOUD.test(conditions),
    places,
  };
}

/** The sign icons of the closures, by country: a motorcycle or a car in a red ring. */
const SIGN = /(?:^|\/)(?:D|AT|CH|NL|B)_Verbot_(Motorrad|Kfz)\.png$/;

/**
 * A feature of the closures as such: a route, named with its postcode, or a sign at one
 * of its ends, marked with the closure's icon. Whether all motor vehicles are kept out,
 * not only motorcycles, the sign's icon or the description says.
 */
export function readClosure(properties: Record<string, unknown>): (Closure & { allVehicles: boolean }) | undefined {
  const name = properties['name'];
  if (typeof name !== 'string') return undefined;
  const icon = typeof properties['icon'] === 'string' ? SIGN.exec(properties['icon']) : null;
  const closure = parseClosureName(name);
  if (!closure || (!closure.postcode && !icon)) return undefined;
  const description = typeof properties['description'] === 'string' ? properties['description'] : '';
  return { ...closure, allVehicles: icon?.[1] === 'Kfz' || /alle Kraftfahrzeuge/i.test(description) };
}
