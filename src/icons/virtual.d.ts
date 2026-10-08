/** The icon sets, built from their packages by tools/iconSets.ts. */
declare module 'virtual:icons/*' {
  const set: import('../model/icon').IconSet;
  export default set;
}

/** The icons the OSM features list names, by `set:name`. */
declare module 'virtual:osm-feature-icons' {
  const icons: Record<string, import('../model/icon').MapIcon>;
  export default icons;
}
