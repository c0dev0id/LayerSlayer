import type { MapIcon } from '../model/icon';
import type { LayerDraft } from '../model/layer';
import { formatFilter, matchesFilter, parseFilter, type OsmObject } from '../services/osm';

/**
 * A kind of OpenStreetMap feature to query: what it is called, the tag filters that find
 * it, and its icon, which features found as lines have none of: icons mark points, and
 * areas at their middle, but not lines. Place names have none either: they are shown by
 * their name alone.
 */
export interface OsmFeature {
  name: string;
  category: string;
  /** Filters as services/overpass reads them; a feature matching any of them is found. */
  filters: string[];
  icon?: MapIcon;
  /** Found as lines (ways and routes), such as roads, paths and fences. */
  lines?: boolean;
  /** Shown by their name alone, without a dot: place names. */
  nameOnly?: boolean;
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

/** The first feature with an icon whose filters the object matches: the icon an OSM element is shown with. */
export function matchingFeature(features: readonly OsmFeature[], object: Pick<OsmObject, 'type' | 'tags'>): OsmFeature | undefined {
  return features.find((feature) => feature.icon && feature.filters.some((filter) => matchesFilter(filter, object)));
}

/** Whether the features are all found as lines, which icons do not mark. */
export function foundAsLines(features: readonly OsmFeature[]): boolean {
  return features.length > 0 && features.every((f) => f.lines);
}

/**
 * How a layer of the chosen features is drawn: with the picked icon, none for null, or else
 * the first chosen feature's icon; features all found as lines get none. Place names alone
 * are labelled with their name and have no dots.
 */
export function layerLook(chosen: readonly OsmFeature[], picked: MapIcon | null | undefined): Pick<LayerDraft, 'icon' | 'label' | 'dots'> {
  const icon = foundAsLines(chosen) ? undefined : picked === undefined ? chosen.find((f) => f.icon)?.icon : (picked ?? undefined);
  const names = chosen.length > 0 && chosen.every((f) => f.nameOnly);
  return { ...(icon && { icon }), ...(names && { label: 'name', dots: false as const }) };
}

/** Tags typed in as a feature of their own, named by its filter. Throws where the tags cannot be read. */
export function typedFeature(text: string): OsmFeature {
  const filter = formatFilter(parseFilter(text));
  return { name: filter, category: 'Tags', filters: [filter] };
}
