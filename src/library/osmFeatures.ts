import type { MapIcon } from '../model/icon';
import { formatFilter, matchesFilter, parseFilter } from '../services/osm';

/**
 * A kind of OpenStreetMap feature to query: what it is called, the tag filters that find
 * it, and its icon, which features found as lines have none of: icons mark points, and
 * areas at their middle, but not lines.
 */
export interface OsmFeature {
  name: string;
  category: string;
  /** Filters as services/overpass reads them; a feature matching any of them is found. */
  filters: string[];
  icon?: MapIcon;
  /** Found as lines (ways and routes), such as roads, paths and fences. */
  lines?: boolean;
}

/** The kinds of features the OSM Query tab offers, with their icons. */
export async function loadOsmFeatures(): Promise<OsmFeature[]> {
  const [{ default: list }, { default: icons }] = await Promise.all([import('./osmFeatures.json'), import('virtual:osm-feature-icons')]);
  return list.features.map(({ icon, ...feature }) => ({ ...feature, ...(icon && { icon: icons[icon] }) }));
}

/** Features whose name, category or filters contain every word of the search. */
export function filterOsmFeatures(features: readonly OsmFeature[], query: string): OsmFeature[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return features.filter((f) => words.every((w) => `${f.name} ${f.category} ${f.filters.join(' ')}`.toLowerCase().includes(w)));
}

/** The first feature with an icon whose filters the tags match: the icon an OSM element is shown with. */
export function matchingFeature(features: readonly OsmFeature[], tags: Readonly<Record<string, string>>): OsmFeature | undefined {
  return features.find((feature) => feature.icon && feature.filters.some((filter) => matchesFilter(filter, tags)));
}

/** Tags typed in as a feature of their own, named by its filter. Throws where the tags cannot be read. */
export function typedFeature(text: string): OsmFeature {
  const filter = formatFilter(parseFilter(text));
  return { name: filter, category: 'Tags', filters: [filter] };
}
