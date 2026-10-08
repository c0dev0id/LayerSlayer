/** The icon sets, built from their packages by tools/iconSets.ts. */
declare module 'virtual:icons/*' {
  const set: import('./iconSets').IconSet;
  export default set;
}
