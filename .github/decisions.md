# Key decisions

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
- **The background colour is a MapLibre background layer.** The composed style always
  starts with a `background` layer, white unless the project sets a colour, rather than
  colouring the page behind the canvas, so it is part of the map: it shows through
  see-through layers and is in anything drawn from the canvas. In 3D it also keeps the
  ground opaque: MapLibre draws background layers onto the ground, and ground left
  see-through by a transparent bottom layer showed the walls hanging from the tile edges
  through it. MapLibre's documentation names a background layer as the remedy; turning the
  walls off (`terrainSkirtLength: 'none'`) can leave hairline gaps between tiles of
  different zooms instead. The colour is a setting kept with the others and carried by
  project files, as part of how a project looks.
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
    XYZ (`/tile/{z}/{y}/{x}`); anything else is drawn by `export` per tile, the whole map
    or one layer (`show:id`). Its zooms are the levels the cache holds: ArcGIS Online tile
    layers list all 24 levels of the scheme and name the cached ones in `minLOD` and
    `maxLOD` (the FAA's charts hold 8 to 12), and asking beyond them gets nothing instead
    of the enlarged deepest level.
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
  also records `dmd: true` where every layer a service offers has an address other apps
  fill in (the DMD tag), so the library shows the tag before a service is read; reading
  every service whenever the library opens would ask all of its servers at once. It reads
  live services, so it is run by hand. Esri World Imagery (in mappic) was left out: its
  keyless endpoint is only licensed with Esri software. The feature services WMSproxy had
  to refuse for want of a renderer (its `docs/feature-servers.md`) are in the library,
  with the distinct rail datasets of geodata.bts.gov; the per-railroad views of the rail
  network were left out as copies of the same lines. Amsterdam's travel time feed, also in
  that list, was left out: its server resets HTTPS connections and gives no answer over
  HTTP. Later additions came from the public sources outdoor apps (onX, Gaia GPS) draw
  on: BLM land managers, wilderness and study areas, NPS park roads and trails, USGS mines
  (MRDS), NOAA's smoke forecast and EPA AirNow's air quality layers. HIFLD's transmission
  lines stay, noted as archived by their publisher. The national mapping services Topo GPS
  (uk.rdzl.topo.gps) bundles were reviewed for ones usable here: only those whose own
  licence is open (the licence Topo GPS records per map, not its app terms), that need no
  key, that are not already listed, and that serve Web Mercator were added. Most were
  ruled out for serving only a national projection (Lithuania EPSG:3346, Czech ČÚZK
  EPSG:5514) or for being reachable only through Topo GPS's authenticated tile servers;
  the ones added are Luxembourg's geoportail.lu (CC BY 4.0), Flanders' aerial imagery
  (Digitaal Vlaanderen open data) and Poland's orthophoto mosaic (GUGiK open data), each
  a public WMTS.
  - Two files, merged at build. The library is split in two so each half can be
    edited on its own terms. `library.json` is the technical definition of every
    service — type, address, zooms, bounds, CORS — the part a unit test guards and
    `check-library` writes to. `library.toml` is the name, region, category and
    description, the part a maintainer rewords or re-sorts, kept free of JSON
    punctuation and readable as one overview. An `id` on each entry joins the two;
    `tools/libraryData.ts` merges them into `virtual:library` at build time and
    fails if an id is unmatched or names a region `regions.ts` lacks. The overlay
    cannot add, remove or retype a service: those change the technical file, where
    the tests are. TOML over JSON5 or YAML for the overlay because it carries no
    nesting here and needs the least punctuation to maintain.
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
  - A layer's technical details are read from the layer, not the service. Its kind,
    version, data and format come from its source the way an entry's come from the layers
    a service offers (`sourceFacts`), and a style's from the style the map has loaded
    already (`layerFacts`), so opening them sends no request and works for a service that
    is down. The address and the name in the service are the layer's origin, which already
    held both for marking what the add-layer lists show as added. The titles leading to it
    in the service's tree are recorded on each offer when the service is read
    (`withPaths`), before a library entry gives a service's only layer its own name, and
    kept with the layer when it is added (`originPath`), since the layer's own name is the
    user's to change and a service's tree is only known by reading it again. Layers added
    before this have no path and show none.
  - A raster layer's address for other apps (the *DMD* tag) is read from its source, with
    no request. DMD2's custom raster maps take an address and fill in either {z}, {x} and
    {y} (XYZ, a WMTS with the zoom as tile matrix, an ArcGIS tile cache) or {bbox} (a WMS
    GetMap, an ArcGIS export); y counted from the bottom does not work there, and only
    https addresses count. So a layer has one where it is an XYZ template counted from the
    top (cached ArcGIS map services are read as one), a WMTS whose tile matrices are named
    by their zoom, with or without a prefix or leading zeros, a WMS, or an ArcGIS map
    service drawn by export. Leading zeros are taken as the zoom without asking the
    server: TopPlusOpen, named 00 to 18, answers the bare zoom with the same tiles.
    Templates with subdomains give their first one, as such apps fill in no list. A WMS
    gives the GetMap the map itself uses, and an ArcGIS map service its export, with
    {bbox} for the tile's extent in Web Mercator metres and 256 pixels across, the size of
    the tiles such apps draw, so labels keep their size. XYZ addresses work in DMD2, and
    WMS ones did for the GeoServer layers tried (MobiData BW, Mobilitätsatlas). ArcGIS
    exports were at first left out on the belief that DMD2 takes no export address; DMD2
    draws them (PAD-US tried), so they are given out like a GetMap. The tag is a pill
    after the layer's name, so it shows in the list whether the settings are open or not.
    A library entry carries it where every layer of its service does, as `check-library`
    records it; a unit test holds the marks of tile templates to their address. A
    service's layers in Add layer carry none, and neither does an entry whose layers
    differ: a pill on every row of a service repeated the entry's, and the library stays
    quieter for the few services that lose out (NASA GIBS has an address for 1306 of its
    1330 layers). In the settings, the address and the source line are one line each, cut
    short, and copy themselves when clicked: the source line copies the address the layer
    was added from (a capabilities document, not a tile template with matrix
    placeholders), the same one its details show.
  - An entry's attribution credits every layer of its service, not only the tile templates
    and files that cannot name one themselves. It is set where a service credits its
    sources elsewhere than in its layers: terrestris names them only in its service's
    access constraints, a long list of sources ending in a privacy clause, so its entry
    holds the line terrestris asks for, with a link to its service page.
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
  the cache off the composer is told so (`tileCache`) and sends no layer's tiles through
  the cache; with the proxy off it gets no hosts, and with all layers the hosts of all
  layers join those chosen for it, as if each layer had it ticked (`proxiedHostsOf`, one
  memo that the network module and the layer tags both read). Every request was tried
  first and broke the services the app asks itself: Postpass and Overpass are asked by
  POST, which proxies often cannot pass, and they need no proxy, as they send CORS
  headers. The layers' own choices are untouched and apply again once switched on. The
  switches, like the proxy address, are this browser's: they are left out of project files
  (`projectSettings`) and kept when a project is opened (`browserSettings`). The proxy
  address is shown as text rather than an open field and is changed in place; an address
  without `{url}` is kept only once confirmed, as most proxies read the target from a
  query parameter, where a target appended as it is loses everything after its first `&`.
  The cache's tile count and size are on two lines, each with its unit, since "935, 93.1
  MB" on one line read as one number.
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
  - A route can be recalculated, for a road network that changed since or legs that
    failed: its cached legs are dropped and routed again, failed ones included. The old
    lines are not kept on screen until the new ones arrive; the pump knows only missing
    legs, and a third state for outdated ones would reach into the drawing, the counts
    and the export. The legs are drawn straight meanwhile, which also shows the progress.
    Dropping them is an undo step, so an undo brings the old legs back, also halfway
    through. Above 500 legs, at least nine minutes at one request per 1.1 s, it asks
    first.
  - The GPX format, reading and writing, is `services/gpx.ts`; reading keeps track
    segments, which the layer import draws apart and the route import joins.
  - Waypoints belong to a route (`routeId`): the one being drawn when the waypoint is
    placed. They are no route points, which stay what the routing joins, so they are a
    list of their own beside the routes rather than part of a route; a route entry is
    still what a GPX file holds, the line with its waypoints, so a route's deletion takes
    its waypoints along in the same undo step, and only the route being drawn has its
    waypoints draggable. Stored waypoints whose route is missing are dropped when read.
  - A route's colour, line width, outline, waypoint size and waypoint look are route edits
    like its name, so they are undo steps: left out of the history, an undo of an earlier
    edit would restore the snapshot taken before it and quietly revert them. A colour
    picker and a slider send an input per movement, so edits of one gesture
    (`recordEdit(label, gesture)`) make one step; the input's change event (`endGesture`)
    closes it. The waypoint size shares the 1–3× range of layer icons (`model/icon.ts`);
    pins are 27 px wide at 1×. The line width shares the 0.5–10 px range and the slider of
    a vector layer's lines. Width and outline are properties of each line feature of the
    route overlay, read by the line and its casing (white, 1.5 px on each side, unless the
    route sets its own colour and a width of 0–4 px), so one overlay layer draws every
    route in its own look.
  - Waypoints take a pin colour, and their names a text colour, a size (8–24 px, as layer
    labels) and a box colour, from their route, like their size. The name keeps its box:
    the box keeps it readable on any map, as an outline does for a layer's labels, so the
    text gets no outline of its own. Colours a route leaves unset follow the panel's
    theme, and their pickers show the theme's colour. The outline and the waypoint look
    are set in panels like a layer's label style, beside the line width and waypoint size
    sliders; each panel names its own anchor, as every route's settings are shown at once.
    A pin stands on a soft shadow centred on its tip, sized with the pin, so that it reads
    as standing on the map rather than floating over it.
  - A waypoint has a type: a plain pin, or one of ten little objects standing on the map
    (start and finish flags, a camera on a tripod for a photo spot, a meeting point sign,
    a pause sign for a break, a plate with fork and knife, a coffee cup, a fuel pump, a
    yellow hazard triangle for a warning and a blue “i” sign for information). They are
    drawn by hand as SVG (`ui/WaypointShape.tsx`) rather than as icon-set symbols in a
    pin, which was the first plan: objects stand out from the map's own markers, and need
    no icon set loaded. Each has fixed colours, so that a start flag or a fuel pump reads
    the same on every route; the route's pin colour is for plain pins. A white outline
    around the whole drawing, an SVG filter that grows its silhouette, sets every object
    off from the map, and the waypoint size scales them as it does pins. A plain pin keeps
    the free choice of a symbol from the icon sets; the store drops the symbol of a
    waypoint that has a type. The dialog shows the types drawn as the map draws them. A
    type this version does not know is dropped when routes are read, which leaves a plain
    pin. GPX export writes no types, as it writes no symbols.
  - Waypoints shrink with the map, names included: full size from zoom 14, half every four
    zooms below it, and never below about a third. The zoom is measured at the waypoint's
    place, from how many pixels ten metres across the screen take there, so on a flat map
    it is the map's zoom and in 3D distant waypoints shrink while near ones keep their
    size. The whole marker is scaled from its foot by a CSS transform, set again on the
    events MapLibre places markers on (the map moving, the terrain changing) and while it
    is dragged; MapLibre's markers keep one size otherwise.
  - Route lines can be coloured along their length instead of in the route's colour: a
    rainbow from start to end, elevation, slope in the direction the route was drawn or
    the reverse, or surface. MapLibre's `line-gradient` follows only `line-progress`, the
    same for every feature of a layer, so a gradient per route would need a style layer
    per route, against the overlay's fixed layers. Each drawn leg is instead sampled at
    least every 25 m and drawn as pieces of one colour, the line layer taking each piece's
    colour; continuous scales come in 32 steps, so that neighbouring stretches join into
    one piece. The outline stays one line per leg underneath, and a leg whose data has not
    arrived keeps the route's colour.
    - Elevation comes from Mapterhorn's Terrarium tiles, the ones 3D terrain uses, read at
      zoom 12 (about 13 m a pixel in central Europe, some 100 kB a tile) and interpolated
      between pixels. Its colours span the route's own lowest to highest point, so a
      low-mountain tour uses the whole ramp; they cannot be compared between routes. Slope
      is the rise over the samples around 100 m centred on each stretch, in classes at 3,
      6, 10 and 15 % either way: climbs warm, descents cool, the flat green. The reversed
      slope reads the route from its end.
    - OSRM answers with no surface. One Postpass query fetches the OSM roads within 20 m
      of all legs that lack one, as a strip along their simplified course, and each
      stretch takes the surface of the nearest road that runs along it, within 35°, so
      that roads crossing it do not count. Asking for the nearest road of each sample in
      SQL took 37 s for a 26 km route; the strip took 1.6 s and 143 kB. The Overpass API
      (`around` the lines) answers where Postpass fails. Surfaces are grouped as paved,
      compacted (with fine gravel), gravel (with `unpaved`, which says no more), dirt and
      sand, and grass. Without a surface tag a track's grade decides, and main and
      residential roads count as paved, as nearly all are; other roads stay unknown.
    - Both are read per leg, keyed by its routed geometry, so that a leg recalculated
      along other roads is read anew, for all legs missing them at once, and kept for the
      session only: the route stores its colouring, not the data.
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
  - Saving a layer as GeoJSON hands out the features the layer keeps in the browser.
    File layers and OSM query layers keep their features as GeoJSON whatever they came
    from, so there is nothing to convert: the saved file adds back with the same features
    (an OSM query's tags and *Update* stay with the layer, not the file), and other
    applications read GeoJSON more widely than the formats it came from. A GeoPDF keeps
    only the picture of its map, so it is not offered.
  - GeoJSON itself has no styling; the one convention other applications read
    (geojson.io, GitHub) is the simplestyle spec, properties on each feature. A saved file
    carries the layer's look in them: colour, opacity and line width as stroke and fill,
    and points as markers in its colour, small for dots, medium or large for icons by
    their size, with the icon's name where it is a Maki icon, as simplestyle's symbols
    are Maki's. Dashes and labels have no such property and are lost. Styling the
    features brought along, such as a KML file's, is dropped first, so the file shows the
    layer's colours rather than those of the file it came from. Adding the file back draws
    it in a palette colour like any other file: styling in files is not read.
  - Requests to the routing server go out directly, not through the CORS proxy; it sends
    `Access-Control-Allow-Origin: *`.
- **The focus area limits requests through source bounds and covers the rest.** The area
  is a polygon kept with the layers. Its bounding box, intersected with each layer's
  bounds, becomes the `bounds` of the layer's source, which MapLibre uses to skip tiles
  outside; explicit bounds take precedence over a TileJSON's, so this also covers COGs and
  the tiled sources of styles. Feature layers, otherwise not limited to their bounds, get
  the box too. Whole-file sources (GeoJSON, images) cannot be limited and are only left
  out, like every other layer, when their bounds miss the box.
  - Tiles that meet the box load whole, so layers draw past the polygon up to the edges of
    those tiles. Everything outside the polygon is therefore covered in the map's
    background colour and dimmed: a world polygon with the area as its hole, wound against
    the world ring, since MapLibre takes a ring wound like the first as a polygon of its
    own. It sits between the layers and the route lines, so routes stay visible outside.
    Its colour is the background colour 40 % of the way to black, one opaque fill rather
    than a second, see-through one over it. The cover reads the background colour from
    the style's global state, which the composed style sets: a new colour is one state
    change in the next diff, not new data, and a colour that is the same for every feature
    lets MapLibre draw the cover in its opaque pass, skipping what lies beneath.
  - The bottom layer used to be exempt, loading everywhere so that the area kept its
    surroundings, with the outside only dimmed. Zoomed out, with the area forgotten, the
    base map everywhere and the upper layers in tile-shaped patches around the box read as
    tiles failing to load. MapLibre cannot clip a layer to a polygon (there is no clip
    layer, and raster layers take no geometry filter), so keeping the base map outside
    while hiding the layers above it would need tiles masked pixel by pixel in the tile
    protocol, or custom layers that copy and restore the framebuffer. The cover is one
    fill; the bottom layer is now limited like the others, as its tiles outside would only
    load to stay hidden.
  - A tap on the cover finds no features: those under it are not drawn.
  - The cover shows the coastlines and country borders of Natural Earth at 1:110 million,
    loading nothing there, as if the area were raised over its place on a smaller map:
    they are shrunk around the area's centre so that, with the area filling an 800 px
    view, the world is at zoom 4, and they zoom with the map, keeping that distance. The
    world keeps the map's scale around an area too large for that. The shrinking is done
    in the data, in Web Mercator, so the map keeps one camera; panning far from the area
    leaves the small world behind. The lines are cut off where they meet the area, the
    cuts found in Web Mercator too, where MapLibre draws the area's edges straight.
  - The outline data was generated once from the `world-atlas` 2.0.2 package
    (`countries-110m.json`: the mesh of the land, and the borders between different
    countries) with coordinates rounded to 0.01° and the cuts of the data left out:
    edges along and across the antimeridian and along the bottom of Antarctica, which
    would draw as straight lines across the small world. At 115 KB, 41 KB compressed, it
    is a chunk loaded with the first focus area; the 1:50 million data is ten times the
    size. A build-time plugin reading the package, as for the icon sets, was the
    alternative: easier to regenerate, but three development dependencies for data that
    does not change.
  - A graticule on the cover was tried and dropped as clutter. The area's blue outline
    looked like a debugging aid; its outline is now in the colour of the coastlines, and
    it also hides where the drawn edge and the map's own differ by a pixel.
  - The area looks raised over the cover: it casts a shadow, has a bevel just inside its
    edge, light where the edge faces the light and dark where it faces away, and an
    outline. The light comes from 335° on screen, where MapLibre's hillshading has it, so
    the shadow keeps its side as the map turns and tilts. They are drawn on a 2D canvas
    over the map's (`map/focusShadow.ts`), the one thing drawn over the layers outside
    the composed style: the area filled with a canvas shadow and then wiped out leaves an
    exact drop shadow, corners included, and the bevel is the surroundings' shadow inside
    the area. Each edge is drawn in steps projected onto the ground, so it follows the
    terrain in 3D. The canvas is drawn after each frame of the map that moves the area on
    screen; redrawn after every frame, its blur halved the frame rate while 3D tiles
    loaded. The shadow, soft anyway, has a canvas of one pixel to the CSS pixel, and the
    bevel and outline one at the screen's resolution, which spares the blur most of its
    pixels on dense screens. The shadow takes the background colour from the map's
    global state, as the cover does, so they always agree; before the first composed
    style there is neither. In the style, the edges' lighting would have to come from the
    bearing in the global state, and a feature property drawn with a value from the
    global state makes MapLibre load the source again on every change, so on every frame
    of a turn; lines offset from each edge also left notches at the corners.
  - The shadow is 28 px long and as wide blurred while the area fills the view, at the
    zoom that also puts the cover's world at zoom 4, and halves with every zoom level out,
    so that it keeps its shape as the area shrinks; a fixed length looked ever softer and
    larger around a small area. Zoomed in further it keeps its length, as it would soon
    cover the screen.
  - On a dark background no shadow shows on the dimmed cover, so there the area casts a
    light glow instead; the switch is where the cover's luminance falls below 0.2.
  - The outline and the shadow can be given colours of one's own in the focus area
    section, kept with the project like the background colour. A chosen outline is drawn
    as it is; every shadow is see-through, a light one more so, as the glow is. A new
    colour moves nothing on the map, so it has the map draw a frame, after which the
    canvases are drawn again.
  - In 3D the ground keeps its elevation everywhere: MapLibre takes ground without
    elevation tiles as sea level, so limiting it would raise a wall at the box's edge in
    the mountains, draped in the cover. The hillshading is limited like the layers.
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
- **Precaching fetches what the map would ask for, politely.** A precached tile is only of
  use if its address is the one the map asks for, so the templates are the source the
  composer gives the map for that layer (without the cache prefix) and filled in by
  `tileUrl`, a copy of maplibre-gl 6's `CanonicalTileID.url` (template by `(x + y) % n`,
  quadkey, `{ratio}`, the 256 px grid behind `{bbox-epsg-3857}`); a test holds its
  bounding box to one MapLibre wrote. Tile zooms follow MapLibre's covering zoom: the map
  zoom plus log2(512 / tile size), no deeper than the source's deepest zoom, whose tiles
  the map enlarges beyond it. The tiles of each zoom are those whose square meets the
  focus polygon (an edge passes through the square, or its centre is inside), not the
  whole bounding box. They are found row by row: a row takes the columns its stretch of
  each edge passes through, and the spans between the edges' crossings of its middle line.
  Testing every square took seconds at deep zooms; the row scan takes milliseconds, and a
  test holds it to the square-by-square answer. Areas whose box holds more than two
  million tiles are refused rather than walked. Sizes are estimated from three tiles
  spread over each zoom, picked by counting along the rows, and averaged. Samples, runs
  and the map all load tiles through one function that answers from the cache where it can
  and keeps what it fetches. Precached tiles are kept until the cache is cleared: each
  tile carries when it expires (`never` for these) instead of when it was stored, so the
  start-up sweep leaves them, and the cache name moved to v2. Tiles already kept for a day
  are kept for good without being fetched again. A run asks one tile at a time with 100 ms
  after each tile fetched, 500 ms where *Slow fetch* is chosen, and stops after 20
  failures in a row, as the server is then down or refusing; missing tiles (404) are
  counted, not failures. The app author's own servers, anywhere under codevoid.de, allow
  full speed: their tiles are asked for four at a time without pauses. They are listed by
  host with the servers that ask for restraint, so the dialog names them the same way
  (without a link, as there is no policy page), and a pace (the pause after each tile and
  how many at a time) follows from each server's entry. It counts as it goes
  and updates the panel about five times a second. The OpenStreetMap Foundation's tile
  policy names "save area for later" features as prohibited and OpenRailwayMap forbids
  bulk requests, so their layers are left out without a choice; volunteer servers that ask
  for restraint are left out or fetched slowly (`bulkPolicies.ts`). Feature layers
  (queries, as fresh as their last run), PMTiles archives (better downloaded whole) and
  styles (tiles from addresses inside the style) are not precached. There is no service
  worker, so a run lasts as long as the page; the browser is asked to keep the site's
  storage (`storage.persist`).
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
  vehicle services come first) and a field for typed tags (`key=value`, `key=*`, several
  separated by spaces all having to match, quotes around spaces, and `node`, `way` or
  `relation` first for only that kind of object). Filters are parsed and written one way
  (`services/osm.ts`), so a curated entry and typed tags are the same thing to the query,
  which joins every filter's statement (`nwr`, or the kind it names) with the focus
  polygon (`poly:`, the polygon itself rather than its bounds) and asks for `out geom`.
  The focus area is required, not just advised: a query without one would be worldwide and
  time out anyway. Querying is done once; the result is converted to GeoJSON and stored
  like an imported file, so it travels in project files and costs Overpass nothing while
  the map is used. The layer is a plain GeoJSON layer that records its `query` (filters
  and the time it ran), not a source kind of its own, so drawing and file handling know
  nothing of Overpass; *Update* runs the query again in the focus area as it is then, one
  update per layer at a time. Overpass reports timeouts and memory exhaustion with status
  200 and a `remark`, which is treated as the failure it is; its 429 and 504 pages, like
  any busy server's, are put in words by `statusMessage`. One layer has one colour;
  features that should look different go in separate layers.
  - Place names are presets of their own (`"nameOnly": true`): their layers are labelled
    with `name` and have no dots, so they read as a labels layer over any base map, and
    start opaque like layers with icons. They ask for nodes only (`node place=town`): in a
    box around Germany, beside 2 902 town and 51 457 village nodes, 309 towns and 746
    villages are also areas, nearly all municipality boundaries tagged with the place and
    mostly with a node of the same name inside, which drew a filled area and the name
    twice. Islands are left out, being mostly areas.
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
  - The overlays' data is inline, and with the world's outline on the focus cover it runs
    to thousands of points, which every diff cloned and compared, a few milliseconds per
    step of a slider. Once an overlay is on the map, the same `transformStyle` shows the
    diff an empty stand-in for its data on both sides, so its data changes through
    `setData` alone and reaches the map once per change. The style given to `setStyle`
    is copied rather than changed: MapLibre rebuilds from it when a diff fails.
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
  created with an icon or a label start opaque, the exceptions to the half-transparent
  default, since icons on see-through discs and see-through text read poorly. The OSM
  feature presets each name an icon, except the 38 found as lines (`"lines": true`):
  icons mark points and areas, never lines, so roads or fences get none; and the place
  names, which are shown by their name alone. The plugin serves just those icons
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
- **3D terrain is part of the composed style.** Every layer change applies the whole style
  with a diff, so terrain set with `map.setTerrain` (as MapLibre's TerrainControl does)
  would be dropped by the next change. The 3D button switches `settings.terrain` instead,
  and `composeStyle` then adds a `raster-dem` source and the style's `terrain`; the button
  also tilts the map, so the relief shows. Elevation comes from Mapterhorn
  (Terrarium-encoded WebP tiles, 512 px, CORS, no key): global at about 30 m and finer
  where countries publish it, down to zoom 18 in Germany. Where finer data ends its tiles
  answer 404 and MapLibre keeps the coarser parent tile, so those errors are not shown.
  The AWS Terrain Tiles (Mapzen) were the alternative: also keyless, but coarser and
  ending at zoom 15. The ground is not limited to the focus area, its shading is (see the
  focus area).
  3D brings hillshading along: a hillshade layer inserted right above the bottom layer, so
  the base map is shaded and overlays are not. The map tilts up to 70°, ten more than
  MapLibre's default, which allows up to 180 but calls anything past 60 experimental:
  tried over the Alps with terrain, from 75° on the ground nearest the camera went missing
  in wedges. With terrain the style has a sky, by day MapLibre's own colours and by night
  a dark blue, whose fog blends the distant ground into the horizon, except while a focus
  area is set, when the small world on its cover would fade into it (a ground blend of 1
  puts the fog beyond the horizon); the 3D button goes from flat to day to night and back
  to flat. The map itself is not dimmed at night: dark base maps exist, and dimming them
  would leave them too dark. A flat map has no sky: tilted that far it shows white above
  the horizon, which is fine for a map. It reads the same tiles through a second source,
  as MapLibre advises for terrain and hillshade, and is lighter than MapLibre's default
  (exaggeration 0.3), which darkened a raster base map's labels in the Alps.
  In 3D, the layers keep more detail in the distance than MapLibre gives them: its default
  lets the tile zoom fall off so fast toward the horizon that the distant base map and
  tracks came from tiles several zooms coarser, with oversized labels and fat roads.
  Compared at 70° over the Alps, 6 zoom levels on screen (`setSourceTileLodParams`,
  default about 9.3) sharpened the distance for about twice the tiles and left the near
  ground as it was; 4 made the near ground coarser, and allowing more tiles (a ratio of 6
  instead of 3) cost three times the tiles for little more. The elevation source keeps
  MapLibre's default: the ground's mesh picks its tiles by that default whatever the
  source says, and elevation tiles picked otherwise did not match its tiles, which raised
  whole tiles above their neighbours, walls and all (seen in the Hunsrück). The setting
  belongs to each source rather than to the style, so it is set again after every style
  change, which may bring new sources; a flat map keeps MapLibre's default. Finer distant
  tiles also draw a far track thinner, down to broken dashes near the horizon.
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
  Labels are dark text in a white outline unless the layer sets its own colour and size
  for the text and colour and width for the outline, in a small panel beside the label
  choice. The panel is a native popover placed under its button by CSS anchor positioning:
  no script places or closes it, a click elsewhere or Esc closes it, and the map stays in
  view while it is open, unlike in a modal dialog. Label offsets are counted in ems of the
  text, so they are worked out from its size and labels keep their distance from lines and
  dots at any size.
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
