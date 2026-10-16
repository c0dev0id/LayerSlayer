/** The library, merged from library.json and library.toml by tools/libraryData.ts. */
declare module 'virtual:library' {
  const library: { entries: import('./library').LibraryEntry[] };
  export default library;
}
