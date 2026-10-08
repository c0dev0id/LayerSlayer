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

A route tool, taken from mappic, draws routes over the layers: points tapped on the map are
joined along the roads by OSRM routing or by straight lines, with waypoints, undo and redo,
and GPX export and import.

It is a static single-page app on GitHub Pages; there is no server component.

## Software stack

- SolidJS 1.9 (UI and state), Vite 8 (build), TypeScript 7 (type checking).
- MapLibre GL JS 6 (rendering, Web Mercator).
- @maplibre/geojson-vt and @maplibre/vt-pbf (feature query results to vector tiles; both
  are MapLibre's own dependencies).
- @maplibre/maplibre-gl-style-spec (validating imported styles; loaded on demand).
- @tmcw/togeojson and fflate (KML and KMZ import), @mapbox/vector-tile and pbf (reading a
  vector tile's layer names), geotiff.js and @geomatico/maplibre-cog-protocol (COGs); all
  loaded on demand.
- pdf.js (legacy build) and @cantoo/pdf-lib (GeoPDF import; loaded on demand).
- idb-keyval (IndexedDB for imported files).
- Vitest 5 with jsdom for unit tests of the pure modules.
- Icons from Tabler Icons (MIT), copied as SVG paths into `src/ui/icons.tsx`.
- Routing by the FOSSGIS OSRM servers (routing.openstreetmap.de), car, bike and foot.
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
  - Feature sources (ArcGIS FeatureServer, WFS, OGC API – Features) share one tile
    protocol, `features://`, whose tile address carries the source as JSON;
    `featureTiles.ts` builds each kind's query, reads the GeoJSON answer (and the messages
    of ArcGIS errors, OGC API errors and WFS exception reports, which come as XML whatever
    was asked for), and the tile is cut and cached like any other.
  - ArcGIS FeatureServer: the feature protocol answers each vector tile with
    one extent query (`f=geojson`, generalised to about a pixel), cut into a tile with
    `geoJSONToTile` and encoded with vt-pbf, so MapLibre loads, caches and overzooms it like
    any vector source. Tiles are queried up to zoom 14. A tile with more features than one
    query returns is truncated (logged once per layer). Opening a FeatureServer also reads
    each feature layer's own description and feature count, because the service listing
    understates its layers: the NTAD services list 1000 records and JSON only, where each
    layer allows 2000, GeoJSON and tile queries. Layers that support `resultType=tile` are
    queried that way with their `tileMaxRecordCount` (4000 or 8000 on hosted services); on
    the NTAD rail lines a zoom 9 tile then came back complete with 3597 features in 1.4 s,
    against a standard query cut off at 2000 after 23 s. A layer whose features all fit in
    one query is shown from zoom 0, since no tile can hold more; a larger one starts at
    zoom 9 (or the service's minimum where higher), because a low-zoom tile makes the
    server return its whole record limit. Where a layer's own description cannot be read,
    the service's word is taken and its query formats are not checked, since hosted layers
    support GeoJSON even where the service says only JSON. The source is not limited to the
    layer's bounds: those are where the features were when the layer was added, and live
    data moves.
  - WFS 2.0 and 1.1: a GetFeature per tile with the server's spelling of GeoJSON output
    (`application/json` on GeoServer, `application/json; subtype=geojson` on MapServer),
    at the GetFeature address its capabilities name. Axis order was tested on GeoServer
    and MapServer: both write GeoJSON in longitude and latitude for `SRSNAME=EPSG:4326`,
    but MapServer reads a plain `EPSG:4326` box latitude first (as WFS 2.0 says) and so
    finds nothing in a longitude-first one. The box is therefore sent as
    `lat,lon,lat,lon,urn:ogc:def:crs:EPSG::4326`, whose axis order both follow. Servers
    list only their native CRS per type (GeoServer supports any), so the listed CRSs are
    not used to decide anything. Types start at zoom 9: a feature count per type
    (`resultType=hits`) would cost a request each, and services list up to hundreds of
    types. The limit per tile is 2000, or the server's `CountDefault` where lower.
  - OGC API – Features: read from a landing page (its `data` link), the collections list
    or one collection; each feature collection is queried per tile with `bbox` (CRS84,
    longitude first) and `limit` at its items link of type `application/geo+json`,
    preferring the plain RFC 7946 profile where a server also offers JSON-FG. Requests for
    the service description send `Accept: application/json`, since these servers answer
    HTML to a browser's default.
  - Vector tiles without a style: each tile layer (`source-layer`) is a layer of its own
    with the plain vector style in its colour, so tile layers stack and colour like other
    vector layers; a style is what reads a tile set as a map, and those are added as
    styles. A TileJSON lists the tile layers and the zoom each begins at. A bare template
    lists nothing, so its zoom 0 tile is read for layer names, and its zoom 14 tile where
    the map is, since layers that begin at higher zooms (buildings, addresses) are absent
    from the zoom 0 tile; its tiles are taken to end at zoom 14, where most tile sets do.
  - Cloud Optimized GeoTIFF: drawn by @geomatico/maplibre-cog-protocol (`cog://`), which
    reads tiles by range requests and serves a TileJSON for the source. It does not
    reproject, and rejects only projected systems other than 3857, so a geographic
    (EPSG:4326) GeoTIFF would be drawn misplaced: the reader checks the geokeys itself and
    turns away anything but Web Mercator, naming the GDAL command. Imagery keeps its own
    colours; single-band data of more than 8 bits would be drawn clipped as grey, so it
    gets a spectral ramp over the value range of the smallest overview (scale and offset
    applied, nodata left out), the one read that stays small however large the file. The
    file is fetched by the protocol itself, outside MapLibre's request transform, so the
    CORS proxy does not apply to COGs, and the tile cache does not either.
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
  so the map starts where it was), saved by `persistedStore` after writes through the
  store's setter, once per batch of writes, rather than by an effect that serialises the
  store and so subscribes to every property; imported files are Blobs in IndexedDB, referenced by key,
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
  work in DOM-based viewers but need the proxy here. Library entries marked `cors: false`
  route their host through the proxy before the first request, when a proxy is set. Load
  errors name who answered (the server, or the proxy for it), the status and the reason
  the answer gives, and never the proxy's address, which holds any key it was given.
  Tested with corsproxy.io: its free plan passes text only (capabilities, JSON feature
  data) and answers images with 403; the Hobby plan adds images, so Karlsruhe, BRGM and
  DGT draw through it, but still refuses OGC types such as `application/vnd.ogc.wms_xml`.
  MapServer sends 1.1.1 capabilities as that type, which is one reason WMS capabilities
  are asked for as 1.3.0 (then `text/xml`), as other clients do. As a Cloudflare worker
  the proxy cannot reach hosts that Cloudflare refuses (maps.geogratis.gc.ca gives Error
  1000), whatever the plan.
- **The library.** Generated once from WMSproxy's `library.json` and mappic's base maps;
  each entry names its type explicitly, and a unit test checks that address detection
  agrees with every entry. `npm run check-library` reads every entry with the app's own
  parsers and records `cors: false` for servers without a valid CORS header; an error
  answer leaves the mark as it was, since servers rarely add CORS headers to errors. It
  reads live services, so it is run by hand. Esri World Imagery (in mappic) was left out:
  its keyless endpoint is only licensed with Esri software. The feature services WMSproxy
  had to refuse for want of a renderer (its `docs/feature-servers.md`) are in the library,
  with the distinct rail datasets of geodata.bts.gov; the per-railroad views of the rail
  network were left out as copies of the same lines. Amsterdam's travel time feed, also in
  that list, was left out: its server resets HTTPS connections and gives no answer over
  HTTP.
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
- **Tile caching is on by default, per layer.** Slow servers often forbid HTTP caching too
  (ArcGIS Online sends `max-age=300`), so the browser cache does not help. A tiled layer
  (XYZ, WMS, WMTS, ArcGIS export and features) whose `cache` is not false has its tile addresses
  prefixed with `cache+` (`cache+https://…`, `cache+wmts-matrix://…`); MapLibre hands
  every scheme it does not know to the protocol registered for it, and one protocol
  answers them all from Cache Storage or fetches the tile and keeps it for 24 hours.
  Caching is thereby a wrapper around fetching rather than part of each source kind.
  Tiles are kept under the address that answers them (the tile URL, a WMTS tile's resolved
  URL, a feature tile's query); empty feature tiles are kept too, errors are not, so a
  missing tile is asked for again. Expired tiles are swept at start-up, and the cache name
  carries a version so a change in what is kept never reads old entries back. Each tile is
  stored with its length in `content-length`, so Settings sums the cache's size from the
  headers (`matchAll`) without reading tile bodies. Cache Storage was chosen over IndexedDB
  because it holds HTTP responses by URL as it is, and the browser accounts for it in the
  site's storage. It is on unless switched off because most tiled services are static and
  slow enough for kept tiles to pay off; it serves tiles up to a day old, so layers with
  live data (radar, traffic) should have it switched off. Styles
  are left out: their tiles come from addresses inside the style. At most four feature
  queries run at once per server; queued tiles that scroll out of view are dropped.
- **Flying to a layer.** The layer row offers a frame icon when the layer's bounds span at
  most half the Web Mercator world in width and in height; an area measure was tried first
  and failed for a week of earthquakes, which spans every longitude but leaves out the
  poles. Bounds the service does not give are found once per session and kept with the
  layer: GeoJSON from MapLibre's `GeoJSONSource.getBounds()` after the data loads, ArcGIS
  feature layers from a `returnExtentOnly` query, since FeatureServers often report the
  whole world as their extent (WFIGS does).
- **Imported styles are validated when fetched.** MapLibre validates the whole style on
  every `setStyle`, so one invalid layer of an imported style would stop all updates; with
  validation off, a skipped layer breaks the `before` positions of the diff. Failing layers
  and sources are dropped at load with a console warning instead.
- **The route tool is mappic's.** Route model, leg routing, edits, history, markers, tap
  filter, toolbar, hint bar, context menu and GPX export are ported from mappic with their
  tests. A route is a list of points; each leg between two points is routed (OSRM
  polyline6, cached on the route under a key of profile and both ends) or straight. Edits
  are pure functions that keep exactly the legs still needed, and a pull-based pump asks
  the state for the next missing leg, one request per 1.1 s as FOSSGIS asks, so nothing
  stale is queued. What differs from mappic:
  - Route lines are part of the composed style (`withRoutes` adds a GeoJSON source and
    three line layers on top). A source added to the map beside the style would be removed
    or reset by the next diffed `setStyle`. A layer change applies the style with the lines
    as they are; a route change or routing result only sets the source's data, which
    spares MapLibre diffing and validating the whole style. The routing credit is that
    source's attribution.
  - Routes and waypoints are a store of their own under the storage key `webmap-routes`,
    apart from the layers. Undo and redo cover this store only, so layer changes are never
    undone; the toolbar and Ctrl+Z work while a route is drawn. Routing results are not
    undo steps; an undo restores the cached legs with the points.
  - The GPX format, reading and writing, is `services/gpx.ts`; reading keeps track
    segments, which the layer import draws apart and the route import joins.
  - GPX import goes into the route editor. Waypoints stay waypoints; a `<rte>` keeps all
    its points and every leg is routed with the profile of the last route, however long
    that takes at one request per second; a leg that fails stays unrouted (red dashed)
    until a point of it moves, which gives it a new key. A `<trk>` is simplified with
    Douglas–Peucker to at most 500 points joined by straight lines, since every point is
    a marker while the route is drawn and an undo step copies all routes. Straight legs
    keep their shape when the profile changes.
  - A GPX file can also be a layer (Add layer > Files), for tracks to look at rather than
    edit. Only its tracks are read, converted to GeoJSON at import and kept as a GeoJSON
    file, so the layer is an ordinary GeoJSON layer with a palette colour and the colour
    setting; several tracks on the map are told apart that way. Routes and waypoints stay
    with the route tool's import, which keeps routing out of the add-layer dialog.
  - KML and KMZ files are layers the same way: their placemarks are converted with
    @tmcw/togeojson (KMZ unzipped with fflate, `doc.kml` or the first KML file) and kept
    as GeoJSON, drawn in the layer's colour. Ground overlays would need a picture placed
    by a box, network links fetch other files, and KML styles would override the colour
    that tells overlapping files apart, so all three are left out. Both libraries are
    loaded when such a file is imported.
  - Requests to the routing server go out directly, not through the CORS proxy; it sends
    `Access-Control-Allow-Origin: *`.
- **The focus area limits requests through source bounds.** The area is a polygon kept
  with the layers. Its bounding box, intersected with each layer's bounds, becomes the
  `bounds` of the layer's source, which MapLibre uses to skip tiles outside; explicit
  bounds take precedence over a TileJSON's, so this also covers COGs and the tiled
  sources of styles. Feature layers, otherwise not limited to their bounds, get the box
  too. Whole-file sources (GeoJSON, images) cannot be limited and are only left out, like
  every other layer, when their bounds miss the box. The bottom layer of the stack is
  exempt, so the area keeps its surroundings for orientation.
  - Tiles that meet the box load whole, so an upper layer still draws past the polygon up
    to the edges of those tiles. The overlay dims everything outside the polygon: a world
    polygon with the area as its hole, wound against the world ring, since MapLibre takes
    a ring wound like the first as a polygon of its own. It sits between the layers and
    the route lines.
  - A new area changes the sources' bounds, which the style diff applies by replacing the
    sources, so their tiles load again.
  - Drawing it goes through the route tool's `Interactions` and tap filter; drawing a
    route and drawing the area exclude each other. The previous area stays until a new
    one is closed.
- **UI after mappic.** Top-first layer list with an active layer whose settings sit below
  it, names renamed in place on the card, a summary line per card (opacity, colour, zoom
  range, cache, proxy) so the list answers which layer is set how without opening each, pointer drag with arrow keys as the keyboard alternative, Tabler icons, the same
  panel layout, and the panel below the map on narrow screens.
- **No browser dialogs.** Questions such as deleting a route are asked in the app's own
  modal `<dialog>` (`ui/confirm.ts`, `ConfirmDialog`), never with `confirm()`: after a
  few native dialogs, browsers offer to silence the page's dialogs, and once silenced
  `confirm()` answers no without asking, so the action could no longer be taken.
- **The add-layer dialog stays open.** Adding many layers from several sources was a chore
  when the dialog closed after each one. Now a tap toggles a layer, the source list and a
  source's layer list take turns without the dialog closing, and only Close leaves it. The
  source list stays mounted (hidden) while a layer list is open, so search, filters, the
  address typed and the scroll position survive; each service is read once per session.
  Whether a layer is on the map is not tracked by the dialog but derived from the layers
  themselves: each carries its `origin` (the source address, plus the layer's name where
  the source names its layers), as in WMSproxy, so the highlights hold across restarts and
  for layers removed in the panel. A library entry with a single layer toggles in place
  instead of opening a list of one. A group (a heading in the layer tree) toggles the
  layers under it, each added as its own layer so each keeps its own opacity and order;
  adding more than 20 at once asks first, since each is fetched and drawn separately.

## Core features

- Layers from WMS, WMTS, ArcGIS MapServer and FeatureServer, XYZ templates, MapLibre
  styles, GeoJSON (URL or file), GPX tracks (file) and GeoPDF (file or URL).
- A library of about a hundred services by region and category, with search.
- An add-layer dialog that stays open: layers and groups toggle with a tap, what is on
  the map is highlighted, and the library and a service's layers can be switched between
  freely. Every layer a service offers is listed, with reasons for those it cannot show
  and a filter for services with hundreds of layers.
- Layer list with drag and keyboard reordering, visibility, removal, flying to the layer's
  area, opacity, zoom range, colour for vector layers, and per-layer error marks.
- Tiles of slow layers kept in the browser for a day, per layer, and a limit on parallel
  feature queries per server.
- Optional CORS proxy, used per host.
- A focus area: a polygon outside whose bounds no layer but the bottom one requests
  tiles, with the map around it dimmed.
- Route drawing over the layers: routed or straight legs, insert, drag and delete points,
  waypoints, undo and redo, car, bike and foot profiles, GPX export and import.
- Layers, routes, settings, view and imported files survive a browser restart.
