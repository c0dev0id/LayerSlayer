# Development journal

## Overview and intent

Public map services come in many technologies: OGC WMS and WMTS, ArcGIS MapServer and
FeatureServer, plain XYZ tile templates, MapLibre styles over vector tiles, GeoJSON files
and feeds, GeoPDFs. Viewers usually support a few of them, or flatten all of them into
raster tiles (as WMSproxy does for navigation apps that only take XYZ).

webmap is a browser map viewer that stacks base maps and overlays from all of these and
supports each properly: it reads the service's own description (capabilities document,
service JSON, the georeference inside a PDF) and draws it with the MapLibre source that
fits, so WMS stays a GetMap per tile, a FeatureServer stays vector data, a style keeps its
vector rendering. A layer list controls order, visibility, opacity and zoom range; the
configuration survives a browser restart. A library of services, grown from WMSproxy's,
offers ready-made layers.

It is a static single-page app on GitHub Pages; there is no server component.

## Software stack

- SolidJS 1.9 (UI and state), Vite 8 (build), TypeScript 7 (type checking).
- MapLibre GL JS 6 (rendering, Web Mercator).
- @maplibre/geojson-vt and @maplibre/vt-pbf (feature query results to vector tiles; both
  are MapLibre's own dependencies).
- @maplibre/maplibre-gl-style-spec (validating imported styles; loaded on demand).
- pdf.js (legacy build) and @cantoo/pdf-lib (GeoPDF import; loaded on demand).
- idb-keyval (IndexedDB for imported files).
- Vitest 5 with jsdom for unit tests of the pure modules.
- Icons from Tabler Icons (MIT), copied as SVG paths into `src/ui/icons.tsx`.
- Deployment: GitHub Actions to GitHub Pages.

## Key decisions

- **One map, one composed style.** All user layers are composed by a pure function
  (`composeStyle`) into one MapLibre style, bottom to top, and applied with
  `setStyle(style, { diff: true })`, so MapLibre works out the minimal changes (paint
  properties, zoom ranges, layer order, sources). Source and layer ids are the user layer's
  id, or start with it and a slash, which maps errors back to layers. Hidden layers are
  left out of the style. The style is passed as plain JSON because Solid store proxies
  cannot be posted to MapLibre's workers.
- **Opacity is native for every layer kind.** Raster layers use `raster-opacity`, the
  app's vector style its fill, line and circle opacities. An imported MapLibre style gets
  the layer opacity multiplied into the opacity properties of each of its layers; zoom
  expressions must stay at the top of a value, so the outputs of a top-level `interpolate`
  or `step` are scaled instead of wrapping them. Hillshade layers have no opacity property
  and stay as they are. Overlapping parts of one style show through each other at reduced
  opacity, as in any MapLibre map.
- **Blend modes are not implemented yet** (nice to have, opacity came first). MapLibre has
  no layer blend modes. Two ways were evaluated: separate map canvases stacked with CSS
  `mix-blend-mode` (any mode, but one WebGL context per blended layer and camera syncing),
  and mappic's approach of custom layers that copy the framebuffer and blend in a shader.
  For MapLibre's own layers the latter needs a pair of custom layers around each blended
  layer (copy and clear before, blend after) and a 3D custom layer at the bottom, because
  layers below the first 3D layer draw their opaque fills in an earlier top-down pass. Custom
  layers are not serialised, so `setStyle` diffs leave them alone and they can be put back
  in place after each diff.
- **Each service kind maps to a native source.**
  - WMS: a raster source with `{bbox-epsg-3857}` in a GetMap URL, 512 px tiles, the
    service's name for Web Mercator. Scale denominators become zoom ranges.
  - WMTS: accepted when a linked tile matrix set is Web Mercator with its origin at the
    world's top left, one tile size, and every matrix at a whole zoom's resolution; matrix
    limits narrow it. Matrix identifiers that equal the zoom, or the zoom behind a common
    prefix (`EPSG:3857:12`), become `{z}`; any other naming (TopPlusOpen's `00`–`18`) goes
    through the `wmts-matrix://` protocol, which looks the identifier up per tile.
  - ArcGIS MapServer: a cached Web Mercator service whose levels are numbered by zoom is
    XYZ (`/tile/{z}/{y}/{x}`); anything else is drawn by `export` per tile, the whole map or
    one layer (`show:id`).
  - ArcGIS FeatureServer: the `arcgis-features://` protocol answers each vector tile with
    one extent query (`f=geojson`, generalised to about a pixel), cut into a tile with
    `geoJSONToTile` and encoded with vt-pbf, so MapLibre loads, caches and overzooms it like
    any vector source. Tiles are queried up to zoom 14. A tile with more features than one
    query returns is truncated (logged once per layer). The service's query formats are not
    checked at service level, since hosted layers support GeoJSON even where the service
    says only JSON.
  - XYZ: Leaflet and OpenLayers spellings are converted (`{s}` and `{a-c}` to one template
    per subdomain, `{-y}` to the TMS scheme, `{q}` to `{quadkey}`, `{r}` to `{ratio}`).
  - MapLibre style: sources and layers prefixed with the layer id, URLs made absolute
    (placeholders kept), zoom ranges narrowed to the layer's. The bottom style brings the
    fonts and the default sprite; the sprite of a style above it is added under the layer
    id and its image references are rewritten to match. A map has one font source.
  - GeoPDF: rendered once to a picture and drawn as an image source by its four corners.
- **Web Mercator only.** MapLibre draws Web Mercator; services without it are listed with
  the reason instead of being reprojected.
- **Zoom conventions.** MapLibre's zoom 0 shows the world 512 px wide, one zoom below a
  256 px tile pyramid's. Scale denominators convert to map zoom with that in mind; source
  `minzoom`/`maxzoom` stay in the source's own tile zooms.
- **Persistence.** Layers, settings and the view are JSON in local storage (synchronous,
  so the map starts where it was); imported files are Blobs in IndexedDB, referenced by key,
  deleted with their layer and swept at start-up. Before 1.0 there is no migration: stored
  layers that no longer have the current shape are dropped one by one.
- **CORS is the limit of a static site.** WebGL needs CORS-clean images. Requests go
  through one function (`requestUrl`), used by MapLibre's `transformRequest` and by the
  app's own fetches and protocols: plain HTTP is upgraded on an HTTPS page, and hosts the
  user marks go through a CORS proxy of their choice (`{url}` template). Proxying is per
  host because a server either sends CORS headers or does not. No proxy is built in.
  The header must hold exactly one value: mobil.trk.de sends `Access-Control-Allow-Origin: *`
  twice when a request carries an Origin, and Chromium refuses that for fetches and for
  `crossorigin` images, while a plain `<img>` (Leaflet's tiles) still loads. Such servers
  work in DOM-based viewers but need the proxy here.
- **The library.** Generated once from WMSproxy's `library.json` and mappic's base maps;
  each entry names its type explicitly, and a unit test checks that address detection
  agrees with every entry. `npm run check-library` reads every entry with the app's own
  parsers and records `cors: false` for servers without a valid CORS header; it reads live
  services, so it is run by hand. Esri World Imagery (in mappic) was left out: its keyless
  endpoint is only licensed with Esri software.
- **GeoPDF georeferencing.** Only ISO 32000-2 geospatial viewports (Adobe's extension:
  `/VP` with a `/Measure` of subtype `/GEO`, `GPTS` and `LPTS`) are read; the OGC/TerraGo
  `LGIDict` encoding is not. pdf.js gives no access to raw page dictionaries, so pdf-lib
  reads them. The largest viewport is the map. The unit square of `LPTS` maps onto the
  viewport `BBox` in the order it is written, not normalised: GDAL writes the bottom edge
  first, Adobe-style files the top edge (found with GDAL's `adobe_style_geospatial.pdf`,
  which renders north up with `LPTS (0,0)` at its northern edge). The point pairs are fitted
  projectively in Web Mercator. The page is rendered cropped to the viewport, at most
  4096 px on the long side and 6× scale, and kept as WebP (PNG where the browser cannot
  encode WebP). pdf.js 6 uses `Map.prototype.getOrInsertComputed`, which current Chromium
  lacks, so its legacy build is used.
- **Imported styles are validated when fetched.** MapLibre validates the whole style on
  every `setStyle`, so one invalid layer of an imported style would stop all updates; with
  validation off, a skipped layer breaks the `before` positions of the diff. Failing layers
  and sources are dropped at load with a console warning instead.
- **UI after mappic.** Top-first layer list with an active layer whose settings sit below
  it, pointer drag with arrow keys as the keyboard alternative, Tabler icons, the same
  panel layout, and the panel below the map on narrow screens.

## Core features

- Layers from WMS, WMTS, ArcGIS MapServer and FeatureServer, XYZ templates, MapLibre
  styles, GeoJSON (URL or file) and GeoPDF (file or URL).
- A library of about a hundred services by region and category, with search.
- Service browser listing every layer a service offers, with reasons for those it cannot
  show and a filter for services with hundreds of layers.
- Layer list with drag and keyboard reordering, visibility, removal, opacity, zoom range,
  colour for vector layers, zoom to layer, and per-layer error marks.
- Optional CORS proxy, used per host.
- Layers, settings, view and imported files survive a browser restart.
