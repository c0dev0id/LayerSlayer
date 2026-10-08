import type { MapIcon } from '../model/icon';
import { formatFilter, parseFilter } from '../services/overpass';

/** A kind of OpenStreetMap feature to query: what it is called, the tag filters that find it, and its icon. */
export interface OsmFeature {
  name: string;
  category: string;
  /** Filters as services/overpass reads them; a feature matching any of them is found. */
  filters: string[];
  icon?: MapIcon;
}

/** The kinds of features the OSM Query tab offers, with their icons. */
export async function loadOsmFeatures(): Promise<OsmFeature[]> {
  const [{ default: list }, { default: icons }] = await Promise.all([import('./osmFeatures.json'), import('virtual:osm-feature-icons')]);
  return list.features.map((feature) => ({ ...feature, icon: icons[feature.icon] }));
}

/** Features whose name, category or filters contain every word of the search. */
export function filterOsmFeatures(features: readonly OsmFeature[], query: string): OsmFeature[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return features.filter((f) => words.every((w) => `${f.name} ${f.category} ${f.filters.join(' ')}`.toLowerCase().includes(w)));
}

/** Tags typed in as a feature of their own, named by its filter. Throws where the tags cannot be read. */
export function typedFeature(text: string): OsmFeature {
  const filter = formatFilter(parseFilter(text));
  return { name: filter, category: 'Tags', filters: [filter] };
}
