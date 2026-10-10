# Development journal

## Overview and intent

Public map services come in many technologies: OGC WMS, WMTS and WFS, OGC API – Features,
ArcGIS MapServer and FeatureServer, plain XYZ tile templates, vector tiles and PMTiles
archives, MapLibre styles, Cloud Optimized GeoTIFFs, GeoJSON feeds, GPX and KML files,
GeoPDFs. Viewers usually support a few of them, or flatten all of them into raster tiles
(as WMSproxy does for navigation apps that only take XYZ).

Layer Slayer (formerly webmap) is a browser map viewer that stacks base maps and overlays
from all of these and supports each properly: it reads the service's own description
(capabilities document, service JSON, the georeference inside a PDF) and draws it with the
MapLibre source that fits, so WMS stays a GetMap per tile, a FeatureServer stays vector
data, a style keeps its vector rendering. A layer list controls order, visibility, opacity
and zoom range; the configuration survives a browser restart. A library of services, grown
from WMSproxy's, offers ready-made layers. Vector features can be labelled and tapped for
their properties in words.

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
  vector tile's layer names), geotiff.js and @geomatico/maplibre-cog-protocol (COGs),
  pmtiles (PMTiles archives); all loaded on demand.
- pdf.js (legacy build) and @cantoo/pdf-lib (GeoPDF import; loaded on demand).
- osmtogeojson (Overpass answers to GeoJSON, multipolygon and route relations included;
  loaded on demand). Its latest release is 3.0.0-beta.5; it pins a vulnerable
  `@xmldom/xmldom` that only its command-line tool uses, lifted by an npm override.
- idb-keyval (IndexedDB for imported files and OSM query results).
- Vitest 5 with jsdom for unit tests of the pure modules.
- Icons from Tabler Icons (MIT), copied as SVG paths into `src/ui/icons.tsx`.
- Layer icons from Maki (CC0), Temaki (CC0) and Material Design Icons (Apache 2.0), read
  from their packages at build time by a Vite plugin (`tools/iconSets.ts`); dev
  dependencies only, each set a chunk that loads with the icon picker.
- Routing by the FOSSGIS OSRM servers (routing.openstreetmap.de), car, bike and foot.
- OSM queries and spot details by Postpass (postpass.geofabrik.de), with the Overpass API
  (overpass-api.de) as fallback; place search by Nominatim (nominatim.openstreetmap.org);
  the sea or ocean at a spot by the Marine Regions gazetteer (marineregions.org).
- Fonts for labels of vector layers from OpenFreeMap (tiles.openfreemap.org) where no
  style on the map brings fonts.
- Elevation for 3D terrain from Mapterhorn (tiles.mapterhorn.com).
- Deployment: GitHub Actions to GitHub Pages.

## Key decisions

- **One map, one composed style.** All user layers are composed by a pure function
  (`composeStyle`) into one MapLibre style, bottom to top, and applied with
  `setStyle(style, { diff: true })`, so MapLibre works out the minimal changes (paint
  properties, zoom ranges, layer order, sources). Source and layer ids are the user
  layer's id, or start with it and a slash, which maps errors back to layers. Layers not
  shown (their eye off, or another layer shown alone) are left out of the style. The style
  is passed as plain JSON because Solid store proxies cannot be posted to MapLibre's
  workers.
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
  layers below the first 3D layer draw their opaque fills in an earlier top-down pass.
  Custom layers are not serialised, so `setStyle` diffs leave them alone and they can be
  put back in place after each diff.
- **Colour adjustments instead of blend modes.** What MapLibre offers within its own
  rendering is five raster paint properties, applied per pixel in this order: hue
  rotation, saturation, contrast, then a brightness range (black and white become
  `brightness-min` and `-max`; min above max inverts). They are raw sliders on raster
  layers, without presets, since no preset fits every map; the brightness ends are grey
  levels, so tinting toward a chosen colour is not possible. Every layer is composited
  with plain alpha blending (`ColorMode.alphaBlended`). Vector layers and imported styles
  have no such properties; adjusting them would mean rewriting the colours in the style.
- **The background colour is a MapLibre background layer.** Choosing a colour adds a
  `background` layer at the bottom of the composed style rather than colouring the page
  behind the canvas, so it is part of the map: it shows through see-through layers and is
  in anything drawn from the canvas. It is a setting kept with the others and carried by
  project files, as part of how a project looks; without one the map stays on white.
- **ArcGIS symbology as a per-layer choice.** Vector layers without a style are drawn in
  one colour each (5 px dots with a white rim, 2.5 px lines, areas filled at a quarter of
  the opacity), which keeps overlapping layers apart. ArcGIS feature layers describe their
  own look (`drawingInfo`), so they can opt into it. The description is read as an asset
  when the option is on, not stored with the layer, as picture markers carry their images.
  Simple, unique value (one to three fields, joined with the delimiter) and class breaks
  renderers become a value, a `match` or a `step`; points become icons (simple markers drawn
  on a canvas at the screen's pixel ratio, picture markers decoded from their image data),
  which the map asks for through `styleimagemissing`, so the composed style stays plain
  data. Hatched fills are a light wash of their colour; CIM symbols, visual variables,
  labels and other renderers are not drawn, and such a layer keeps its colour with the
  reason shown. KML styles are still dropped on import. A library entry can turn the
  option on from the start (`ownStyle`) where the service's colours are the data, as the
  AQI categories of EPA AirNow are; one colour would make such a layer meaningless.
- **Each service kind maps to a native source.**
  - WMS: a raster source with `{bbox-epsg-3857}` in a GetMap URL, 512 px tiles, the
    service's name for Web Mercator. Scale denominators become zoom ranges. A layer's time
    dimension (`Dimension` in 1.3.0, `Extent` in 1.1.1, inherited like the CRS) is kept
    with the source as the service lists it, and the time chosen is sent as `TIME`, so a
    new time is a new tile address and the tile cache needs nothing of its own. The
    settings list the times where a range steps by years, months or days and has at most
    a thousand of them, as for map editions (Rhineland-Palatinate's TK25 lists 1887 to
    2024); times of day, as weather services give, are typed. The service's default is
    drawn first, else the last time it lists. Other dimensions (elevation) are left out.
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
    each feature layer's own description, because the service listing understates its
    layers: the NTAD services list 1000 records and JSON only, where each
    layer allows 2000, GeoJSON and tile queries. Layers that support `resultType=tile` are
    queried that way with their `tileMaxRecordCount` (4000 or 8000 on hosted services); on
    the NTAD rail lines a zoom 9 tile then came back complete with 3597 features in 1.4 s,
    against a standard query cut off at 2000 after 23 s. Feature layers are shown from zoom
    0, or the service's own minimum. They first started at zoom 9 when larger than one
    query, found by a count request per layer, because a low-zoom tile makes the server
    return its whole record limit; the focus area made that unnecessary, since it keeps
    the queries of a zoomed-out view to the area, and the count requests went with it.
    Where a layer's own description cannot be read,
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
    not used to decide anything. The limit per tile is 2000, or the server's
    `CountDefault` where lower.
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
  - PMTiles: the archive's tiles are the existing kinds, so a vector archive becomes
    vector tile layers and an image archive an XYZ layer, with
    `pmtiles://<archive>/{z}/{x}/{y}` as the template; colours, raster adjustments, the
    focus area and the tile cache (`cache+pmtiles://`) then work as for any tile layer.
    The app's own protocol handler reads them with the pmtiles library's `PMTiles` class
    rather than its `Protocol`, whose archives fetch directly and so would bypass the CORS
    proxy: each archive is opened through `requestUrl`, kept per request address so that
    routing a host through the proxy opens it anew, and failed reads become the app's
    readable messages. The addresses are those of the library's protocol, and a bare
    `pmtiles://<archive>` answers its TileJSON, so styles written for PMTiles (Protomaps)
    draw unchanged. A tile the archive lacks is answered empty, drawn as nothing rather
    than as an error. The header has no tile size, so it is read from the image of one
    tile. Layers are named after the file: tippecanoe writes the paths of its input files
    as the name and description. MapLibre Tiles (MLT) archives are turned away.
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
  store and so subscribes to every property; imported files are Blobs in IndexedDB,
  referenced by key, deleted by one store effect once no layer uses them (removed, given
  new data, or replaced by an opened project) and swept at start-up. Before 1.0 there is
  no migration: stored layers that no longer have the current shape are dropped one by
  one.
- **Named Layer Slayer, formerly webmap.** The name shows in the page title, the panel,
  messages, GPX files and saved project names. The repository is `c0dev0id/LayerSlayer`,
  the site `https://shagen.me/LayerSlayer/` (it was `/webmap/`), the package
  `layerslayer`. The storage keys (local storage, IndexedDB, the tile cache) moved to
  `layerslayer` too; what a browser held under `webmap` is not carried over, and the
  start-up sweep deletes the old tile cache, which is only a cache. Project files went
  from `.webmap` to `.lslay`, marked `"app": "layerslayer"`. The format is otherwise the
  same, so *Open* still reads `.webmap` files (`"app": "webmap"`) as they are: the one
  way to bring a project from before the rename, and the one exception to having no
  migration before 1.0.
- **The logo** (a globe cut by a sword) is for now the square around the globe and sword
  cut from the generated prototype, as a 256 px PNG on its navy ground: the browser tab
  icon, the panel header mark and the README image. A trace into SVG looked worse than
  the original and was dropped; a regenerated logo is to replace it. The name is page
  text, not part of the image.
- **Project files, as in mappic.** *Save* writes a ZIP (`.lslay`): `project.json` with
  the layers, view, focus area, proxied hosts, routes and waypoints, and each stored file
  as `files/<key>` under the key its layer refers to, so nothing needs rewriting. Reading
  goes through the same `parseState` and `parseRouteData` as local storage, and the whole
  file is checked (every layer's file present) before anything is replaced. *Open*
  replaces rather than merges, asks first, clears the route undo history and sweeps the
  files no layer refers to. The proxy address is left out of the file, as it may hold an
  account key, and the browser keeps its own. fflate and the format load on first use.
- **CORS is the limit of a static site.** WebGL needs CORS-clean images. Requests go
  through one function (`requestUrl`), used by MapLibre's `transformRequest` and by the
  app's own fetches and protocols: plain HTTP is upgraded on an HTTPS page, and hosts the
  user marks go through a CORS proxy of their choice (`{url}` template). Proxying is per
  host because a server either sends CORS headers or does not. No proxy is built in. The
  header must hold exactly one value: mobil.trk.de sends `Access-Control-Allow-Origin: *`
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
  HTTP. Later additions came from the public sources outdoor apps (onX, Gaia GPS) draw
  on: BLM land managers, wilderness and study areas, NPS park roads and trails, USGS mines
  (MRDS), NOAA's smoke forecast and EPA AirNow's air quality layers. HIFLD's transmission
  lines stay, noted as archived by their publisher.
  - German history: the History category holds what was found open, with CORS and in Web
    Mercator: Berlin's course of the Wall of 1989 (WMS with the aerial photo it was traced
    from, and WFS), the BKG's GDR map 1:200 000 in its restricted state edition and its
    public one, the Reich 1:25 000 maps of Brandenburg, North Rhine-Westphalia's 1:25 000
    of 1936–1945 (drawn at 1:2 000 to 1:27 000 only), Saxony's historical maps (with the
    GDR's restricted 1:25 000 state edition) and the monument lists of Bavaria and Saxony.
    Left out: Rhineland-Palatinate's Westwall objects (its capabilities say no
    constraints, but every map answers "Permission denied", and the WFS asks for a login),
    Lower Saxony's monuments and Mecklenburg-Vorpommern's Messtischblätter (use
    restricted), Saarland's 1935–1940 maps (embedding needs a contract), Trier's former
    French military sites (no CORS) and Bavaria's index of 1941–1945 aerial photos (its
    address no longer answers). No public service maps US forces in Germany or bunkers as
    such; OpenStreetMap has them, so OSM Query has a History and military group whose tags
    were chosen by how often they are used in Germany (taginfo): `military=bunker` about
    10 800 times, `bunker_type=munitions` 2 500, `bunker_type=hardened_aircraft_shelter`
    440, and about 120 features with a US Army or US Air Force `operator`.
  - Cold War sites are often in OpenStreetMap with no military tag at all: the protected
    zone of the former US special weapons depot at Fischbach bei Dahn is
    `historic=monument` on a forest, others are a `place=locality`, a meadow or a
    brownfield carrying a name such as "ehemaliges US-Sonderwaffenlager Clausen" or "ehem.
    NIKE-Abschussstellung". Filters therefore take `key~text`, a value containing the text
    in any case, sent to Overpass as `["name"~"…",i]` with the text escaped so that it is
    matched literally rather than as a pattern. Four presets search names for depots,
    missile sites and command bunkers. A Nominatim search for those words in Germany found
    about 60 such sites, all of which they match; matching by name also finds bus stops
    named after a missile site and a few DLR buildings, which is accepted rather than
    excluded case by case.
  - An entry's technical details come from two places. What the library holds (address,
    type, CORS, zooms, attribution) shows at once; the kind of data and the formats are
    read from the layers the service offers (`library/entryInfo.ts`), since a WMS's
    image format or a PMTiles archive's tile type is only known from the service. The
    read is the session's one per source that opening the entry also uses, so showing
    the details costs no extra request when the entry is opened, and the other way round.
    A style's kinds and formats come from its sources. Reading is not routed through the
    proxy on its own, unlike opening an entry marked `cors: false`: looking at details
    changes no setting, so such an entry shows why it could not be read.
- **Data a provider keeps to itself stays out.** Rumo's PMTiles archives and styles allow
  only Rumo's own site by their CORS rules, and the MapTiler key in them is limited to
  that domain; OsmAnd's off-road tiles answer other pages' requests with 502. A CORS proxy
  would get either through, but both are read as the provider's refusal and left out of
  the library: the test is the provider's intent, not whether a request gets through.
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
  (XYZ, WMS, WMTS, ArcGIS export, feature sources, vector tiles, PMTiles) whose `cache` is
  not false has its tile addresses prefixed with `cache+` (`cache+https://…`,
  `cache+wmts-matrix://…`, `cache+features://…`, `cache+pmtiles://…`); MapLibre hands
  every scheme it does not know to the protocol registered for it, and one protocol
  answers them all from Cache Storage or fetches the tile and keeps it for 24 hours.
  Caching is thereby a wrapper around fetching rather than part of each source kind. Tiles
  are kept under the address that answers them (the tile URL, a WMTS tile's resolved URL,
  a feature tile's query); empty feature tiles are kept too, errors are not, so a missing
  tile is asked for again. An image tile must be a whole image to count: nothing, text, or
  a PNG, JPEG, GIF or WebP without its end (the PNG's IEND chunk, the JPEG's end marker,
  the WebP's RIFF length) is an error naming the server (`imageCheck.ts`). A proxy that
  re-sends a tile chunked hides a cut-off answer from the browser, which then only reports
  that the image could not be decoded, and the cache would keep the broken tile for a day.
  Raster tiles of layers that keep none go through MapLibre's own loader and are not
  checked. Expired tiles are swept at start-up, and the cache name carries a version so a
  change in what is kept never reads old entries back. Each tile is stored with its length
  in `content-length`, so Settings sums the cache's size from the headers (`matchAll`)
  without reading tile bodies. Cache Storage was chosen over IndexedDB because it holds
  HTTP responses by URL as it is, and the browser accounts for it in the site's storage.
  It is on unless switched off because most tiled services are static and slow enough for
  kept tiles to pay off; it serves tiles up to a day old, so layers with live data (radar,
  traffic) should have it switched off. Styles are left out: their tiles come from
  addresses inside the style. At most four feature queries run at once per server; queued
  tiles that scroll out of view are dropped.
- **Switches for testing override caching and the proxy for all layers.** Settings has a
  switch for the tile cache and a three-way choice for the CORS proxy: off, per layer (the
  default) and all layers, drawn as joined buttons over a radio group (a native control
  for three states does not exist, and radios keep keyboard and screen reader use). With
  the cache off the map is composed as if no layer kept tiles (the layers are handed over
  with `cache: false`, so the composer stays as it is); with the proxy off it gets no
  hosts, and with all layers the hosts of all layers join those chosen for it, as if each
  layer had it ticked (`proxiedHostsOf`). Every request was tried first and broke the
  services the app asks itself: Postpass and Overpass are asked by POST, which proxies
  often cannot pass, and they need no proxy, as they send CORS headers. The layers' own
  choices are untouched and apply again once switched on. The switches, like the proxy
  address, are this browser's: they are left out of project files and kept when a project
  is opened (`browserSettings`). The proxy address is shown as text rather than an open
  field and is changed in place; an address without `{url}` is kept only once confirmed,
  as most proxies read the target from a query parameter, where a target appended as it
  is loses everything after its first `&`. The cache's tile count and size are on two
  lines, each with its unit, since "935, 93.1 MB" on one line read as one number.
- **Flying to a layer.** The layer row offers a frame icon when the layer's bounds span at
  most half the Web Mercator world in width and in height; an area measure was tried first
  and failed for a week of earthquakes, which spans every longitude but leaves out the
  poles. Bounds the service does not give are found once per session and kept with the
  layer: GeoJSON from MapLibre's `GeoJSONSource.getBounds()` after the data loads, ArcGIS
  feature layers from a `returnExtentOnly` query, since FeatureServers often report the
  whole world as their extent (WFIGS does). The flight ends at the zoom the area fits at,
  moved into the layer's zoom range (`areaZoom`): up to its lowest zoom, so a layer drawn
  only from zoom 17 shows however large its area, and half a zoom short of the zoom it is
  hidden from, which fitting to the area capped at that zoom had reached exactly.
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
  - Routes and waypoints are a store of their own under the storage key
    `layerslayer-routes`, apart from the layers. Undo and redo cover this store only, so
    layer changes are never undone; the toolbar and Ctrl+Z work while a route is drawn.
    Routing results are not undo steps; an undo restores the cached legs with the points.
  - The GPX format, reading and writing, is `services/gpx.ts`; reading keeps track
    segments, which the layer import draws apart and the route import joins.
  - Waypoints belong to a route (`routeId`): the one being drawn when the waypoint is
    placed. They are no route points, which stay what the routing joins, so they are a
    list of their own beside the routes rather than part of a route; a route entry is
    still what a GPX file holds, the line with its waypoints, so a route's deletion takes
    its waypoints along in the same undo step, and only the route being drawn has its
    waypoints draggable. Stored waypoints whose route is missing are dropped when read.
  - A route's colour, line width and waypoint size are route edits like its name, so they
    are undo steps: left out of the history, an undo of an earlier edit would restore the
    snapshot taken before it and quietly revert them. A colour picker and a slider send an
    input per movement, so edits of one gesture (`recordEdit(label, gesture)`) make one
    step; the input's change event (`endGesture`) closes it. The waypoint size shares the
    1–3× range of layer icons (`model/icon.ts`); pins are 27 px wide at 1×. The line width
    shares the 0.5–10 px range and the slider of a vector layer's lines; it is a property
    of each line feature of the route overlay (`width`), read by the line and its casing
    (1.5 px wider on each side), so one overlay layer draws every route at its own width.
  - GPX import goes into the route editor. GPX ties waypoints to no route, so a file's
    waypoints belong to its first route or track, or to a route without points named
    after the file when it has none. A `<rte>` keeps all
    its points and every leg is routed with the profile of the last route, however long
    that takes at one request per second; a leg that fails stays unrouted (red dashed)
    until a point of it moves, which gives it a new key. A `<trk>` is simplified with
    Douglas–Peucker to at most 500 points joined by straight lines, since every point is
    a marker while the route is drawn and an undo step copies all routes. Straight legs
    keep their shape when the profile changes.
  - Garmin devices and BaseCamp write the way they calculated for a route into the file:
    each `<rtept>` carries the points of the road on to the next as `gpxx:rpt` in its
    `gpxx:RoutePointExtension` (GPX Extensions v3). Such a route is as good as a track,
    so its route points and their `rpt`s, in order, are read as its course and imported
    like a `<trk>`: simplified, straight legs, nothing routed. Routing its route points
    again would replace Garmin's road with OSRM's, which may take another one. A route
    without `rpt`s is routed as before.
  - A GPX file can also be a layer (Add layer > Files), for tracks to look at rather than
    edit. Only its tracks are read (and routes with Garmin's course, which are as good as
    tracks), converted to GeoJSON at import and kept as a GeoJSON file, so the layer is an
    ordinary GeoJSON layer with a palette colour and the colour setting; several tracks on
    the map are told apart that way. Routes and waypoints stay with the route tool's
    import, which keeps routing out of the add-layer dialog.
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
  - Add layer greys out (never hides) what is known to lie outside the area, without
    requests of its own. Library entries carry a region, not bounds, so `REGION_BOUNDS`
    gives each region generous boxes, overseas parts included; an entry's own `bounds`
    win, and Global entries are never marked. A test requires boxes for every region in
    the library. State services sit under their country, so they are only marked when
    the area lies outside it; inside a service, layers are marked by their own bounds.
- **UI after mappic.** Top-first layer list with an active layer whose settings open in
  its card, in place of its summary line: below the whole list they were a scroll away
  from the layer once the list grew, and editing several layers meant scrolling between
  list and settings for each. A second click on the name closes them, and none are open
  after the open layer is removed. Names are renamed in place on the card, a summary line
  per card (opacity, colour, zoom range, label, cache, proxy) answers which layer is set
  how without opening each, pointer drag has the arrow keys as its keyboard alternative,
  icons are Tabler's, the panel layout is mappic's, and the panel lies below the map on
  narrow screens. There, everything on the
  map competes for little room: the panel folds to its header (a flag in local storage,
  as the panel width is), the search is a button until opened, and the route toolbar is
  one bar of icons in one row (eight tools fit 360 px), its captions kept as the buttons'
  accessible names while the hint bar says what the active tool does.
- **Light and dark interface.** Every colour of the stylesheet is a token on `:root`
  with a light and a dark value (`light-dark()`), so each colour is written once and the
  page shows the browser's preference from the first paint, before any script runs; the
  native controls (inputs, sliders, dialogs, scroll bars) follow `color-scheme` by
  themselves. `state/theme.ts` sets `data-theme` on the root element to the theme shown,
  which fixes `color-scheme` to it. The choice is kept only where it differs from the
  browser's preference: a toggle back to the browser's theme forgets it, so the page
  follows the browser again without a third, "automatic" state to pick. It is this
  browser's convenience like the panel width, not part of projects. Lightning CSS
  lowers `light-dark()` for the build target into its own variables, switched by the
  same `color-scheme` rules. MapLibre's controls take the tokens; their icons are dark
  images, inverted in the dark theme. The map's content is not themed: an empty map
  stays on the background the project sets (white by default), since how a project
  looks should not depend on the browser that opens it.
- **Links to a spot are a hash.** *Copy link* gives the page's address with
  `#map=zoom/lat,lon` (five decimals, about a metre; the zoom with up to two), the
  coordinates in the `lat,lon` of *Copy coordinates*; openstreetmap.org's
  `#map=zoom/lat/lon` is read as well. The spot gets a pin, as the centre of the map is
  lost at the first move; a click removes it, and the next link moves it. A hash needs
  nothing of a static host and never reaches the server; it carries the view only, not the
  layers, which stay each browser's own (a project file carries those). On opening, the
  map starts there instead of the stored view, and a link pasted into the open page moves
  it there (`hashchange`). The hash is then removed with `history.replaceState`, so that a
  reload after moving on opens the map as it was left rather than at the link again.
- **Place search with Nominatim.** OpenStreetMap's geocoder needs no key and sends CORS
  headers, so the page asks it directly (through the proxy only if its host is proxied).
  Its usage policy forbids search as you type and allows one request per second, so a
  search runs on Enter and waits out the second since the last one; the results list
  carries the attribution it asks for. The view is passed as `viewbox` to prefer nearby
  places without excluding others. The first place is shown at once (a MapLibre marker,
  the map fitted to the place's extent up to zoom 17); the others stay listed until one is
  chosen, the map is moved by hand or Esc. The pin is not kept: it marks a search, not
  data. The drawing hint bar moved below the search box.
- **OSM queries without query code.** Layers of OpenStreetMap features are made with the
  Overpass API from tag filters, not Overpass QL: a curated list
  (`library/osmFeatures.json`, each entry a name, a category and its filters; off-road
  riders being the main audience, tracks and trails, access and barriers, roads and
  vehicle services come first) and a field
  for typed tags (`key=value`, `key=*`, several separated by spaces all having to match,
  quotes around spaces). Filters are parsed and written one way (`services/osm.ts`),
  so a curated entry and typed tags are the same thing to the query, which joins every
  filter's `nwr` statement with the focus polygon (`poly:`, the polygon itself rather than
  its bounds) and asks for `out geom`. The focus area is required, not just advised: a
  query without one would be worldwide and time out anyway. Querying is done once; the
  result is converted to GeoJSON and stored like an imported file, so it travels in
  project files and costs Overpass nothing while the map is used. The layer is a plain
  GeoJSON layer that records its `query` (filters and the time it ran), not a source kind
  of its own, so drawing and file handling know nothing of Overpass; *Update* runs the
  query again in the focus area as it is then, one update per layer at a time. Overpass
  reports timeouts and memory exhaustion with status 200 and a `remark`, which is treated
  as the failure it is; its 429 and 504 pages, like any busy server's, are put in words by
  `statusMessage`. One layer has one colour; features that should look different go in
  separate layers.
  - Postpass first, Overpass as fallback. overpass-api.de was often too busy to answer at
    all ("Dispatcher_Client … timeout", 504 even for one node), and its mirrors refused or
    failed in turn. Postpass (github.com/woodpeck/postpass, run by Geofabrik) is an
    osm2pgsql import queried with SQL and answering GeoJSON, with CORS: tagged nodes as
    points, ways and route and boundary relations as lines, closed ways and multipolygon
    and boundary relations as polygons, tags as jsonb with a GIN index. The same filters
    become SQL (`services/postpass.ts`): `tags @> '{"k":"v"}'` and `tags ? 'k'`, which use
    the index, `tags->>'k' ILIKE '%…%'` with its wildcards escaped for `key~text`, the
    focus polygon through `ST_Intersects`, and `DISTINCT ON (osm_type, osm_id)` preferring
    the polygon, since a boundary relation is a line and a polygon. Each filter is a
    SELECT of its own, joined with UNION ALL (`selectObjects`), so that each can use the
    index that fits it; an OR across them made a name search drag every other filter into
    a scan of the area. No index finds text within a value, so a name search reads every
    object in the area, and Postpass puts such a query in its slow queue (estimated cost
    above 150,000). A SELECT per name filter read the area once per filter: the six of
    "Missile sites (by name)" did not answer within 120 s over Rhineland-Palatinate.
    Filters that only search text in the same key are therefore joined into one search
    (`searchesOf`): `ILIKE ANY` for Postpass, one alternation for Overpass. That query
    answered in 4.5 s over Rhineland-Palatinate and in 33 s over all of Germany. Answers
    are reshaped like osmtogeojson's (`way/123` ids, tags as properties, one-part
    multi-geometries single), so layers do not depend on where their features came from.
    Measured from here: Postpass answered the History presets around Fischbach in about a
    second; the main Overpass instance took 8 to 11 s or failed. `services/osm.ts` holds
    what both sources share: the filter language, the OSM objects details read, and
    `postpassOrOverpass`, which asks the Overpass API where Postpass fails and names both
    reasons where neither answers. Postpass gets 10 s for details and 60 s for a layer
    before the Overpass API is asked. QLever's OSM endpoint was tried as well: a name
    search over the planet timed out, and its nearby search measures to centroids only, so
    it is no source for either use.
- **GeoJSON loaded from an address survives style diffs.** MapLibre 6 keeps the GeoJSON it
  loaded from an address in place of the address, so every diffed `setStyle` saw such a
  source as changed and fetched and indexed it again, on any change of any layer (each
  step of an opacity slider). `map/geojsonDiff.ts` passes a `transformStyle` that
  remembers each source's address and, where the next style gives the same one, puts the
  address back into the current style the diff compares against. That relies on MapLibre
  diffing against the very object it hands to `transformStyle`; carrying the loaded data
  into the next style instead, the documented way, would have MapLibre compare and clone
  all of it on every change. A layer whose file changes keeps drawing its old file until
  the new one has loaded, rather than vanishing meanwhile.
- **Layer icons.** Vector layers can mark their points, and their areas at the pole of
  inaccessibility MapLibre places point symbols at, with an icon: white on a disc of the
  layer's colour, which stays readable on any base map while the colour still tells layers
  apart. The sets were chosen for coverage: Maki and Temaki (770 icons, CC0) are drawn for
  maps and named after OpenStreetMap's features, barriers included; Material Design Icons
  (about 7,200 after leaving out brand logos and deprecated ones) cover nearly everything
  else and bring aliases and categories that make search work. All three draw with plain
  `<path>` elements, so an icon is its viewBox and path data, drawn with `Path2D`. The
  plugin turns each package into a virtual module (MDI about 800 kB gzipped), loaded when
  the picker opens. A layer keeps its icon's shape, not just its id, so drawing it needs
  no set loaded and a project file carries it. Its size (1× to 3×) scales the disc, which
  a distance field allows, and is drawn into the icon image, rendered at that many times
  the display's resolution and handed to the map at the display's pixel ratio. Layers
  created with an icon start opaque, the exception to the half-transparent default, since
  icons on see-through discs read poorly. The OSM feature presets each name an icon,
  except the 36 found as lines (`"lines": true`): icons mark points and areas, never
  lines, so roads or fences get none. The plugin serves just those icons
  (`virtual:osm-feature-icons`, 30 kB, loaded when the OSM tab is first shown) and fails
  the build on a name no set has. The disc is one signed distance field image for all
  layers, tinted with `icon-color` and ringed by a white `icon-halo`: colour and opacity
  stay paint properties, so dragging the colour picker neither lays out tiles again nor
  adds images. The icon is a second symbol layer, one image per icon and size
  (`poi:set:name:size`). Images are drawn when the map asks, through
  `setMissingStyleImageResolver`: in MapLibre 6 the `styleimagemissing` event fires only
  after the asking tile was laid out, so images added there missed it, which ArcGIS
  symbols suffered from too. Waypoints keep an icon the same way (`MapIcon`), shown white
  in their pin in place of the dot; GPX export leaves it out, since GPX symbol names are
  device-specific.
- **3D terrain is part of the composed style.** Every layer change applies the whole
  style with a diff, so terrain set with `map.setTerrain` (as MapLibre's TerrainControl
  does) would be dropped by the next change. The 3D button switches `settings.terrain`
  instead, and `composeStyle` then adds a `raster-dem` source and the style's `terrain`;
  the button also tilts the map, so the relief shows. Elevation comes from Mapterhorn
  (Terrarium-encoded WebP tiles, 512 px, CORS, no key): global at about 30 m and finer
  where countries publish it, down to zoom 18 in Germany. Where finer data ends its tiles
  answer 404 and MapLibre keeps the coarser parent tile, so those errors are not shown.
  The AWS Terrain Tiles (Mapzen) were the alternative: also keyless, but coarser and
  ending at zoom 15. Like the bottom layer, the ground is not limited to the focus area.
  3D brings hillshading along: a hillshade layer inserted right above the bottom layer, so
  the base map is shaded and overlays are not. It reads the same tiles through a second
  source, as MapLibre advises for terrain and hillshade, and is lighter than MapLibre's
  default (exaggeration 0.3), which darkened a raster base map's labels in the Alps.
- **Spot details pick what matters on the move.** One Overpass query (`around`, about 40
  pixels at the zoom, 15 to 250 m) asks for drivable ways (motorways down to tracks,
  paths and bridleways; footways and cycleways are left out), places to go to (amenity,
  shop, tourism, craft, office, healthcare; leisure only with a name), barrier nodes and
  history: anything historic, bunkers, former military sites (`abandoned:military`,
  `disused:military`, `historic:military`) and Cold War sites known only by name
  ("Sonderwaffenlager", "Nike-", "Raketenstellung", …, the words of the by-name presets).
  History is a kind of its own, so a bunker next to a road is shown beside the road rather
  than instead of it, with its dates, heritage status, inscription, description and
  Wikipedia article; anything with a `heritage` tag counts, as a listed building or
  monument. Water (lakes, ponds, reservoirs, bays, straits, rivers, streams, canals; not
  ditches and drains) and bridges (`man_made=bridge` outlines and ways tagged `bridge`)
  are kinds too, and an object can be several: a road on a bridge is the road and the
  bridge, the latter named by `bridge:name` rather than the road's name. A lake matters
  most in its middle, far from its shore, so Postpass also answers whether the spot lies
  inside each area (`ST_Intersects`, the column `within`), which counts as no distance
  where the outline, clipped to the box, says nothing; Overpass finds an area only near
  its edge, and its `is_in` could not be tried while every public instance failed. Seas
  and oceans are label points in OpenStreetMap, so the sea at a spot comes from the Marine
  Regions gazetteer instead (its IHO sea areas by English name, a sea before the ocean it
  is part of), asked beside Postpass and shown after its results, as it takes 2 to 3 s;
  where it fails there is no sea card rather than an error. The query looks around the
  spot once (`nwr(around)->.near`) and filters that set by tag, as openstreetmap.org's
  "Query features" does, rather than a lookup per tag: far less work for overpass-api.de,
  whose per-address rate limit refused every few clicks before. Its declared timeout is 10
  s, and relations come clipped to a box twice the radius (`out geom(box)`, points outside
  are null), so a large park does not send its whole outline; a clipped area is measured
  to its edge. openstreetmap.org's tool runs on its own Overpass server
  (query.openstreetmap.org), which only that site may use. Postpass is asked first and
  answered such a lookup in 0.6 to 1.6 s where Overpass took up to 11 s or failed. Its SQL
  asks for the same things (`ST_DWithin` on geography after a test against the same box,
  `?|` for the place keys), gives areas as their outlines (`ST_Boundary`) and clips
  relations to the box (`ST_Intersection`), so what it answers is measured and drawn as
  Overpass's answer was. The details work on OSM objects (type, id, tags, GeoJSON
  geometry) that both sources are turned into, rather than on Overpass elements; at four
  spots in Karlsruhe, Berlin and the Palatinate both gave the same details. The area query
  of OSM Query layers stays one statement per filter: over a large area the tag index
  narrows first, and everything within the area would be far too much. Street furniture
  (benches, bins, vending machines, post boxes, …), kerbs and unnamed information boards
  are dropped. Of each kind the nearest is kept, measured in a local plane to nodes,
  segments and inside closed rings, and the up to six results are shown nearest first, so
  a click near a gate on a track shows both. Tags become words (`motor_vehicle=forestry`
  is "Motor vehicles: Forestry only"), with Tabler icons for the lines and the OSM
  preset's icon where the element matches one; the link to openstreetmap.org shows
  everything else. The details are a non-modal sheet beside the map rather than a centred
  modal, which would hide the very spot: the map stays usable, another spot's details
  replace them, and an overlay highlights the spot and what was found (lines amber with a
  white casing, points as amber rings). A spot in the sheet's column is panned beside it;
  the sheet's height says little, as it grows with its results.
- **Line styles of vector layers.** Width and dashes (solid, dashed, long dashes, dotted)
  apply to lines and the outlines of areas alike, so the setting means something for
  area layers too; unset, lines stay 2.5 and outlines 1.5 pixels. Dash patterns are in
  line widths and allow for the round ends, which add half a width to each end of a dash
  (dotted is a zero-length dash: [0, 2]). MapLibre restarts patterns at tile edges.
- **The panel's width is the browser's, not the project's.** Dragging its edge sets a CSS
  variable on the app's grid (260 to 720 pixels, the map keeping at least 320), kept in
  local storage under its own key; MapLibre follows the container's size by itself.
- **No browser dialogs.** Questions such as deleting a route are asked in the app's own
  modal `<dialog>` (`ui/confirm.ts`, `ConfirmDialog`), never with `confirm()`: after a
  few native dialogs, browsers offer to silence the page's dialogs, and once silenced
  `confirm()` answers no without asking, so the action could no longer be taken.
- **Vector tile templates in the library list their tile layers.** A template has no
  TileJSON to name its layers, and the two sample tiles the reader takes (zoom 0 and zoom
  14 near the view) miss layers that the area or zoom lacks; Open Infrastructure Map's
  petroleum, pipeline and water sets have no tile below zoom 2 or 3 at all. Such entries
  carry `layers`, `minzoom` and `maxzoom` (from the site's own style and sample tiles),
  so opening one reads nothing and no tile below the first zoom is asked for. Open
  Infrastructure Map's solar heatmap was left out: a zoom 5 tile holds 370 000 points in
  8 MB, drawn as a heatmap there, which the app's generated styles do not do. Its base map
  is left out too: its address carries a build date, and OpenFreeMap serves base maps
  with a style.
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
- **Files a page may not read are downloaded by hand.** mintelonline.de publishes its
  motorcycle road closures as GPX, KMZ and a Garmin GDB, without CORS headers, and
  corsproxy.io's free plan refuses the GPX (served as octet-stream). A link downloads a
  file whatever its CORS headers, so a library entry of type `file` offers that link and
  asks for the downloaded file. The layer keeps the address as its `origin`, which
  *Replace* leaves alone, so refreshing it is a download and a replace, with the file's
  date (from the chosen file) shown to tell when it is due. A GeoPDF added by its address
  has that origin too, and so the same link. Replace tells a GeoPDF from features by the
  file's name and type before reading it, and turns away the other kind. The KMZ was
  chosen over the GPX: its routes are full geometries (13 000 points, from the Garmin
  route extension in the GPX) and its signs carry an icon saying whether motorcycles or
  all motor vehicles are kept out. The GDB is MapSource's binary format. Routing the
  routes again was not needed, since their geometry is there.
- **Road closures are read from their names, not converted.** The closure names carry
  postcode, dates, `>95dB`, days, hours and places, one place meaning one way only and
  two both ways (as the site explains). The details sheet reads them when a feature is
  tapped, recognised by a postcode or a closure sign icon, and the file stays as it was:
  the generic property list would show the raw name otherwise, and a converted file could
  not be replaced with a newer download as it is. Conditions are shown as written rather
  than parsed into dates, as their notation varies (`1.4.- 31.10.`, `Fr 22h - Mo 8h`,
  `1.3.-31-10`).
- **Labels use the map's one font source.** MapLibre takes glyphs from one URL per map,
  and font names differ between servers (OpenFreeMap's `Noto Sans Regular`, VersaTiles'
  `noto_sans_regular`). Labels of vector layers are therefore written in a font the
  style bringing the glyphs uses itself, preferring a regular one, and only without any
  style do they use OpenFreeMap's fonts, which allow any origin; the style that brings
  the fonts is chosen once, for the glyphs and the labels' font together. Line labels are
  placed along the line, beside the widest line allowed: `text-offset` is a layout
  property, so an offset that followed the width would lay out every label again at each
  step of the width slider. MapLibre's point placement on lines anchors at a tile's
  first vertex, so it was not used. The label list offers the text and number
  properties the features have (all of a GeoJSON file, those of the loaded tiles
  otherwise), most common first, without KML styling properties.
- **Tapping features queries what is drawn.** A tap outside route and focus area drawing
  asks MapLibre for the rendered features within the tap radius in the style layers of
  vector layers only (those whose source is a user layer's, so the base map is not
  searched), takes each feature's layer from its source, and shows each feature once, as
  a line and its label or two tiles return the same one. The highlight joins a line's or
  area's parts from all loaded tiles, so a long line is marked beyond the tile tapped: one
  `querySourceFeatures` per source, filtered to the simple property values of the
  features tapped; points are taken as drawn. Nothing is fetched: what was drawn is what
  is described.
- **Showing one layer alone is a view, not a change of visibility.** Hiding the other
  layers and restoring them later would need a copy of every eye, kept through reloads
  and edits made meanwhile (an eye toggled while alone: restored over or kept?). Instead a
  session-only flag tells the composer to draw only the open layer, whatever its eye, and
  the bottom layer as its eye says, so the base map stays unless switched off. Every
  layer's `visible` stays as it was, which makes turning it off a plain return; the flag
  follows the open layer, so clicking names flips through layers one at a time, and ends
  when the settings close. One function (`isShown`) decides for the composer and the
  layer list alike, and taps query what the map draws.

## Core features

- Layers from WMS, WMTS, WFS, OGC API – Features, ArcGIS MapServer and FeatureServer, XYZ
  templates, vector tiles, PMTiles archives, MapLibre styles, Cloud Optimized GeoTIFF,
  GeoJSON (URL or file), GPX tracks and KML or KMZ placemarks (file) and GeoPDF (file or
  URL).
- A library of about 150 services and files by region and category, with search.
- An add-layer dialog that stays open: layers and groups toggle with a tap, what is on
  the map is highlighted, and the library and a service's layers can be switched between
  freely. Every layer a service offers is listed, with reasons for those it cannot show
  and a filter for services with hundreds of layers.
- WMS layers with maps of several times drawn at the time chosen in their settings.
- Layer list with drag and keyboard reordering, visibility, removal, flying to the layer's
  area, opacity, zoom range, colour and line style for vector layers, colour adjustments
  for raster layers, and per-layer error marks.
- Labels for vector layers from a feature property, and the properties of a tapped feature
  in words in the details sheet.
- A map button that shows the open layer alone over the base map, leaving every layer's
  visibility as it was.
- File layers that take a newer version of their file, keeping their settings; library
  entries for files that pages may not read, downloaded by a link, among them the
  motorcycle road closures of mintelonline.de, read from their names.
- Tiles of slow layers kept in the browser for a day, per layer, and a limit on parallel
  feature queries per server.
- Place and address search (Nominatim) with a pin on the place found.
- A menu for any spot on the map: its details from OSM (nearest road or trail, place,
  barrier, piece of history, water and bridge, in words) and the sea it lies in, its
  coordinates, a link that opens Layer Slayer there, Google Maps and Street View (Google's
  documented Maps URLs, no key).
- 3D terrain with hillshading from Mapterhorn's open elevation tiles, switched by a button
  on the map.
- Icons for vector layers from about 7,900 (Maki, Temaki, Material Design Icons), white on
  a disc of the layer's colour, picked by search; OSM presets come with theirs.
- OSM query layers: OpenStreetMap features in the focus area, chosen from a list of about
  140 led by what off-road riders look for (tracks, trails, surfaces, barriers, access)
  or typed as tags, queried with Overpass once and updated on demand.
- Optional CORS proxy, used per host.
- Light and dark interface, following the browser unless switched.
- A focus area: a polygon outside whose bounds no layer but the bottom one requests
  tiles, with the map around it dimmed.
- Route drawing over the layers: routed or straight legs, insert, drag and delete points,
  waypoints, undo and redo, car, bike and foot profiles, GPX export and import.
- Layers, routes, settings, view and imported files survive a browser restart, and go
  to another browser as a `.lslay` project file (`.webmap` files from before the
  rename still open).
