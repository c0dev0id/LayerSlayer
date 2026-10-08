import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * The icon sets layers can be drawn with, read from their npm packages at build time and
 * served as virtual modules (`virtual:icons/maki`, …), one chunk each that loads when it is
 * first imported. An icon becomes its path data, its viewBox where it differs from the
 * set's, and words to find it by; the sets draw with plain <path> elements only.
 *
 * `virtual:osm-feature-icons` holds just the icons the OSM features list names, as layers
 * keep them, so that the list can show them without loading whole sets.
 */

interface IconData {
  paths: string[];
  size?: [number, number];
  keywords?: string;
}

interface IconSet {
  id: string;
  name: string;
  size: number;
  icons: Record<string, IconData>;
}

const packageDir = (name: string) => fileURLToPath(new URL(`../node_modules/${name}/`, import.meta.url));

/** The icon of an SVG file: its paths and its viewBox where it is not `size` square. */
function readSvg(file: string, size: number): IconData {
  const svg = readFileSync(file, 'utf8');
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
  if (paths.length === 0 || /<(circle|rect|ellipse|line|polyline|polygon|use)\b/.test(svg)) {
    throw new Error(`${file} draws with more than paths.`);
  }
  const [w, h] = (/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? []).slice(1).map(Number);
  return { paths, ...(w !== undefined && h !== undefined && (w !== size || h !== size) && { size: [w, h] }) };
}

function readFolder(dir: string, size: number, keywords: (name: string) => string | undefined, include: (name: string) => boolean = () => true) {
  const icons: Record<string, IconData> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
    const name = file.slice(0, -4);
    if (!include(name)) continue;
    const words = keywords(name);
    icons[name] = { ...readSvg(dir + file, size), ...(words && { keywords: words }) };
  }
  return icons;
}

const SETS: Record<string, () => IconSet> = {
  maki: () => ({ id: 'maki', name: 'Maki', size: 15, icons: readFolder(`${packageDir('@mapbox/maki')}icons/`, 15, () => undefined) }),
  temaki: () => {
    const dir = packageDir('@rapideditor/temaki');
    const groups = JSON.parse(readFileSync(`${dir}data/icons.json`, 'utf8')) as Record<string, { groups?: string[] }>;
    return { id: 'temaki', name: 'Temaki', size: 15, icons: readFolder(`${dir}icons/`, 15, (name) => groups[name]?.groups?.join(' ')) };
  },
  mdi: () => {
    const dir = packageDir('@mdi/svg');
    const meta = JSON.parse(readFileSync(`${dir}meta.json`, 'utf8')) as { name: string; aliases: string[]; tags: string[]; deprecated: boolean }[];
    // Brand logos are trademarks rather than symbols of places; deprecated icons are on their way out.
    const kept = new Map(meta.filter((m) => !m.deprecated && !m.tags.includes('Brand / Logo')).map((m) => [m.name, [...m.aliases, ...m.tags].join(' ')]));
    return { id: 'mdi', name: 'Material Design Icons', size: 24, icons: readFolder(`${dir}svg/`, 24, (name) => kept.get(name) || undefined, (name) => kept.has(name)) };
  },
};

const built = new Map<string, IconSet>();

function iconSet(id: string): IconSet | undefined {
  if (!built.has(id) && SETS[id]) built.set(id, SETS[id]());
  return built.get(id);
}

const OSM_FEATURES = fileURLToPath(new URL('../src/library/osmFeatures.json', import.meta.url));

/** The icons the OSM features name, by `set:name`, with their shapes. Unknown icons fail the build. */
function osmFeatureIcons(): Record<string, { id: string; size: [number, number]; paths: string[] }> {
  const { features } = JSON.parse(readFileSync(OSM_FEATURES, 'utf8')) as { features: { name: string; icon?: string }[] };
  const icons: Record<string, { id: string; size: [number, number]; paths: string[] }> = {};
  for (const { name, icon } of features) {
    if (!icon || icon in icons) continue;
    const [setId = '', iconName = ''] = icon.split(':');
    const set = iconSet(setId);
    const data = set?.icons[iconName];
    if (!set || !data) throw new Error(`OSM feature "${name}" names the icon ${icon}, which no icon set has.`);
    icons[icon] = { id: icon, size: data.size ?? [set.size, set.size], paths: data.paths };
  }
  return icons;
}

const PREFIX = 'virtual:icons/';
const OSM_ICONS = 'virtual:osm-feature-icons';

export function iconSets(): Plugin {
  return {
    name: 'icon-sets',
    resolveId: (id) => ((id.startsWith(PREFIX) && id.slice(PREFIX.length) in SETS) || id === OSM_ICONS ? `\0${id}` : undefined),
    load(id) {
      if (id === `\0${OSM_ICONS}`) {
        this.addWatchFile(OSM_FEATURES);
        return `export default ${JSON.stringify(osmFeatureIcons())};`;
      }
      if (!id.startsWith(`\0${PREFIX}`)) return undefined;
      return `export default ${JSON.stringify(iconSet(id.slice(PREFIX.length + 1)))};`;
    },
    generateBundle() {
      // The Material Design Icons are under Apache 2.0, which asks for its notice to go along.
      this.emitFile({ type: 'asset', fileName: 'licenses/material-design-icons.txt', source: readFileSync(`${packageDir('@mdi/svg')}LICENSE`, 'utf8') });
    },
  };
}
