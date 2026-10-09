import type { LngLat } from '../model/route';
import { fetchResource } from '../state/net';

/**
 * The sea or ocean at a spot, from the Marine Regions gazetteer of the Flanders Marine
 * Institute (marineregions.org). OpenStreetMap maps seas and oceans as a label point only,
 * so the details cannot find them nearby; the gazetteer's IHO sea areas (the limits of
 * oceans and seas of the International Hydrographic Organization) say which one a spot
 * lies in.
 */

export const SEA_CREDIT = 'Seas from Marine Regions, by the Flanders Marine Institute.';

export interface Sea {
  /** Sea or Ocean. */
  title: string;
  name: string;
  /** The other sea areas the spot lies in, such as the ocean a sea is part of. */
  alsoIn: string[];
  /** The sea area in the gazetteer. */
  url: string;
}

interface GazetteerRecord {
  MRGID: number;
  placeType: string;
  preferredGazetteerName: string;
  preferredGazetteerNameLang: string;
}

const isOcean = (name: string) => /\bocean\b/i.test(name);

/** The sea from the gazetteer's records of a spot: its IHO sea areas, by English name, seas before oceans. */
export function readSea(records: unknown): Sea | undefined {
  if (!Array.isArray(records)) return undefined;
  const names = new Map<number, string>();
  for (const record of records as GazetteerRecord[]) {
    if (record.placeType !== 'IHO Sea Area') continue;
    if (!names.has(record.MRGID) || record.preferredGazetteerNameLang === 'English') names.set(record.MRGID, record.preferredGazetteerName);
  }
  const areas = [...names].sort(([, a], [, b]) => Number(isOcean(a)) - Number(isOcean(b)));
  const [first, ...rest] = areas;
  if (!first) return undefined;
  const [id, name] = first;
  return {
    title: isOcean(name) ? 'Ocean' : 'Sea',
    name,
    alsoIn: rest.map(([, other]) => other),
    url: `https://www.marineregions.org/gazetteer.php?p=details&id=${id}`,
  };
}

/** The sea or ocean the spot lies in, if any. */
export async function findSea([lng, lat]: LngLat): Promise<Sea | undefined> {
  const url = `https://www.marineregions.org/rest/getGazetteerRecordsByLatLong.json/${lat.toFixed(5)}/${lng.toFixed(5)}/`;
  const text = await (await fetchResource(url, { signal: AbortSignal.timeout(15_000) })).text();
  return text ? readSea(JSON.parse(text)) : undefined;
}
