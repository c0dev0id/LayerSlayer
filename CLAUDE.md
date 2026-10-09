# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Layer Slayer (formerly **webmap**) is a static, server-less map viewer: SolidJS + MapLibre
GL JS, built with Vite, deployed to GitHub Pages at https://shagen.me/LayerSlayer/. It
stacks layers from many map service kinds (WMS, WMTS, WFS, OGC API – Features, ArcGIS,
XYZ, MVT, PMTiles, MapLibre styles, COG, GeoJSON, GPX, KML, GeoPDF) and draws OSRM-routed
routes over them.

`README.md` describes behaviour from the user's side; `.github/development-journal.md`
holds the reasoning behind nearly every design choice (its *Key decisions* section). Read
the relevant journal entry before changing how a source kind, the cache, the proxy, the
focus area or persistence works.

## Commands

```sh
npm ci
npm run dev                              # Vite dev server
npm test                                 # all unit tests (Vitest, jsdom, src/ only)
npx vitest run src/map/compose.test.ts   # one test file
npx vitest run -t 'part of a test name'  # tests by name
npm run typecheck                        # tsc --noEmit
npm run build                            # production build to dist/
npm run check-library                    # reads live services; run by hand, never in CI
```

CI (`.github/workflows/build.yml`) runs typecheck, test and build on every push and
deploys `dist/` to Pages from `main`. TypeScript is strict with `noUncheckedIndexedAccess`
and `noUnusedLocals/Parameters`.

## Architecture

**Data flow.** `services/` reads a service's own description (capabilities, `?f=json`,
TileJSON, PMTiles header, GeoPDF viewport…) into a `ServiceInfo`: a list of `Offer`s, each
carrying a `LayerDraft`. `services/detect.ts` guesses the service type from an address;
`services/read.ts` dispatches to the parsers. The draft becomes a `Layer` in the store.
`model/layer.ts` defines the `LayerSource` union, one variant per source kind, and
`SOURCE_KINDS` says which are raster, vector and cacheable.

**One composed style.** `map/compose.ts` (`composeStyle`) is a pure function from the
layer list (bottom first) plus loaded assets to one MapLibre `StyleSpecification`, applied
in `map/MapView.tsx` with `setStyle(style, { diff: true })`. Never add sources or layers
to the map directly: the next diffed `setStyle` drops them. Things the app draws over the
layers (route lines, focus mask, details highlight) are `Overlay`s (`map/overlays.ts`)
appended to the style; their data changes go through `setData` only. Source and layer ids
are the user layer's id or `<id>/…`, which is how map errors are traced back to layers.
The style is round-tripped through JSON before `setStyle`: Solid store proxies cannot be
posted to MapLibre's workers.

**Custom protocols** (registered in `MapView.tsx`, handlers in `map/protocols.ts`):
`features://` (ArcGIS FeatureServer, WFS and OGC API queried per tile, turned into vector
tiles in the browser by `map/featureTiles.ts`), `wmts-matrix://`, `pmtiles://`, `cog://`,
and `cache+<scheme>://`, a wrapper that answers any tiled source from Cache Storage
(`map/tileCache.ts`). Caching is a URL prefix, not part of each source kind.

**Network.** Every request goes through `requestUrl` / `fetchResource` in `state/net.ts`
(MapLibre's `transformRequest` too): HTTPS upgrade and the per-host CORS proxy. New
fetches must use them, or the proxy and readable error messages are bypassed. Routing
(OSRM) is the exception and goes out directly.

**State.** `state/store.ts` holds layers, settings, view and focus area, persisted to
local storage by `persistedStore` (`state/persist.ts`) under the key `layerslayer`.
Routes and waypoints are a separate store (`state/routes.ts`, key `layerslayer-routes`)
with its own undo/redo history (`state/history.ts`); layer changes are never undo steps.
Imported files are Blobs in IndexedDB (`state/files.ts`), referenced by key.
`state/projectFile.ts` reads and writes `.lslay` ZIP project files through the same
parsers as local storage.

**Routing** (`routing/`) is ported from mappic: routes are point lists, each leg routed
by OSRM or straight, edits are pure functions in `routeEdit.ts`, and a pull-based pump
requests one missing leg at a time (`routing/osrm.ts`, about one per second).

**Library.** `src/library/library.json` lists the services offered in Add layer. A unit
test requires `detectServiceType` to agree with every entry's type and `REGION_BOUNDS`
(`library/regions.ts`) to cover every region used. `tools/check-library.test.ts` (the
`check-library` script) rewrites `cors: false` marks in that file.

**Build-time icons.** `tools/iconSets.ts` is a Vite plugin that reads Maki, Temaki and
Material Design Icons from their dev-dependency packages into virtual modules, each a
chunk loaded with the icon picker. UI icons are Tabler SVG paths in `src/ui/icons.tsx`.

## Conventions

- Web Mercator only. Services without it are listed with the reason, never reprojected.
- MapLibre zoom 0 is a 512 px world, one below a 256 px tile pyramid; source
  `minzoom`/`maxzoom` stay in the source's own tile zooms.
- Heavy libraries (pdf.js, pdf-lib, geotiff, pmtiles, togeojson, fflate, osmtogeojson,
  the style spec) are loaded with dynamic `import()` on first use; keep them that way.
- Below 1.0 there is no migration code: stored layers that no longer parse are dropped.
  The one exception: `decodeProjectFile` accepts `.webmap` files (`"app": "webmap"`) from
  before the rename. Everything else uses the name `layerslayer`.
- Unit tests sit beside their modules (`*.test.ts`) and cover the pure modules; service
  parsers are tested against captured responses in `src/services/fixtures/`.
- README and journal are prose wrapped at 90 columns, describing behaviour in plain words
  rather than code terms. Update both when behaviour or a design decision changes.
