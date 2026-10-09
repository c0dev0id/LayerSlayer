# <img src="public/logo.png" alt="" width="40" align="top"> Layer Slayer

A map viewer for the web that stacks base maps and overlays from many kinds of map
services: WMS, WMTS, WFS, OGC API – Features, ArcGIS MapServer and FeatureServer, XYZ tile
templates, vector tiles, PMTiles, MapLibre styles, Cloud Optimized GeoTIFF, GeoJSON, GPX,
KML and GeoPDF, and draws routes over them with GPX export and import. Each service is
read the way it describes itself (capabilities documents, service descriptions,
georeferencing in the PDF) and drawn with the MapLibre source that fits it, rather than
turned into raster tiles by a proxy.

It runs at <https://shagen.me/LayerSlayer/>: a static page built with SolidJS and MapLibre
GL JS and deployed to GitHub Pages by GitHub Actions. Nothing runs on a server; layers,
routes, settings and imported files stay in the browser.

## Using it

A first visit starts with TopPlusOpen, the topographic base map of Germany's federal
mapping agency (BKG), which covers the rest of the world in less detail.

- **Add layer** opens the library, an address field, a file picker and OSM Query. The
  dialog stays open until *Close*: a tap adds a layer in the background and a second tap
  removes it, and what is on the map is highlighted.
  - The **library** lists services by region and category. A service with a single layer
    is added or removed by tapping its entry; others open their list of layers, and
    *‹ Sources* goes back to the library as it was left. Tapping a group adds what of it
    is missing, or removes it when all of it is on the map. Layers a service cannot show
    in Web Mercator are listed with the reason. Some entries are files whose server does
    not let web pages read them, such as mintelonline.de's motorcycle road closures in
    Germany, Austria, Switzerland, the Netherlands and Belgium: the arrow beside the entry
    downloads the file (a link needs no CORS), and tapping the entry asks for the
    downloaded file. The ⓘ beside an entry shows its technical details under it: the
    address, the kind of service and its version, whether the data is raster or vector,
    the format of its tiles or features and how they are asked for, the number of layers,
    its tile zooms and whether the browser reaches it directly or through the CORS proxy.
    The service is read for them, as when the entry is opened.
  - An **address** can be a WMS, WMTS or WFS capabilities URL, an OGC API – Features
    landing page or collection, an ArcGIS MapServer or FeatureServer (or one of its
    layers), a tile template with `{z}/{x}/{y}` (raster, or vector tiles ending in `.pbf`
    or `.mvt`), a TileJSON, a PMTiles archive (`.pmtiles`), a GeoJSON file, a MapLibre
    style, a Cloud Optimized GeoTIFF or a GeoPDF. The kind of service is guessed from the
    address and can be changed. *Open* shows the source's layers. Placeholders that a
    browser copied percent-encoded (`%7Bz%7D/%7Bx%7D/%7By%7D`) are read as `{z}/{x}/{y}`.
  - **Files**: GeoJSON, the tracks of GPX files (routes and waypoints in a GPX file are
    imported under Routes, except routes that carry the way a Garmin device or BaseCamp
    calculated for them, which are drawn like tracks), the placemarks of KML and KMZ
    files, and GeoPDFs with an ISO 32000 geospatial viewport, added as they are chosen.
    Each new GeoJSON, GPX or KML layer takes the next colour of a palette, which its
    settings can change. *Replace* in a file layer's settings takes a newer version of its
    file.
  - **OSM Query** makes a layer of OpenStreetMap features in the focus area, found with
    Postpass, Geofabrik's public PostGIS copy of OpenStreetMap, or with the Overpass API
    where Postpass fails; without a focus area it offers to draw one, since both answer
    queries for limited areas only. Choose features from the list, which starts with what
    matters off the road: tracks by grade, unpaved and rough ways, fords, trails rated for
    mountain bikes and hikers, gates, barriers and ways closed to motor vehicles, then
    roads, fuel and repair, water, camp sites, bunkers, depots and other military history,
    and about a hundred more, each with the tags it stands for and its icon. Or type tags
    and *Add* them: `key=value`, `key=*` for any value, or `key~text` for a value that
    contains the text in any case, e.g. `name~Sonderwaffenlager`, with tags separated by
    spaces all having to match, e.g. `highway=track tracktype=grade4`; values with spaces
    go in double quotes (`operator="US Army"`). Former special weapons depots, missile
    sites and government bunkers are often mapped by their name alone, so the presets for
    them (*by name*) look for the words their names use. A name search reads every object
    in the area, so it takes longer than a search by tag: about 5 s for
    Rhineland-Palatinate, half a minute for all of Germany. *Query* finds everything
    chosen in one layer, named after it, with the icon of the first chosen feature that
    has one; the icon button next to the name picks another, or none. Features found as
    lines (roads, tracks, paths, routes, fences, rivers, power lines) show a line symbol
    instead of an icon and give their layer none, since icons mark points and areas only.
    The result is kept in the browser as GeoJSON.
- The **panel** can be made wider or narrower by dragging its edge (or with the arrow
  keys on it), for longer layer names; a double click on the edge brings it back to its
  usual width.
- The **layer list** shows the top layer first. Drag a layer by its handle (or press the
  arrow keys on it) to change the order; the eye hides it, the pencil renames it, ×
  removes it, and the frame icon flies to the area the layer covers, at a zoom the layer
  is drawn at (layers that span most of the world have none). A layer shown in grey
  italics is outside its zoom range at the current zoom; a red triangle carries the last
  error loading it. Under each name, a small line shows its opacity, colour, the time it
  is drawn at, zoom range (z5–15), and *label*, *cache* and *proxy* where it labels its
  features, its tiles are kept or its server goes through the CORS proxy. *Background*,
  below the last layer, sets the colour the map is drawn on (white unless chosen); it
  shows wherever the layers leave the map uncovered or see-through.
- Clicking a layer's name opens its **settings** in its place in the list, closing those
  of the layer open before; clicking it again closes them. They hold its opacity, zoom
  range, colour (vector layers), source, the CORS proxy for its server and, for tiled
  layers, whether it keeps its tiles in the browser. New layers start at 50% opacity.
  WMS layers with maps of several times, such as Rhineland-Palatinate's topographic maps
  of every year since 1887, have a *Time*: a menu of the years, months or days the service
  lists, or a field to type a time where it lists times of day or too many to choose from.
  Raster layers (XYZ, WMS, WMTS, ArcGIS MapServer, GeoTIFF, placed images) have *Colour
  adjustments*: hue, saturation, contrast, and the brightness black and white become.
  Black at 100% and white at 0% inverts the image; with the hue turned 180° that gives a
  dark map that keeps its colours. ArcGIS feature layers can be *drawn with the service's
  own symbols* (simple, unique value and class breaks renderers with simple and picture
  symbols) instead of their colour. Vector layers have a *Line* style (solid, dashed, long
  dashes, dotted) and width for their lines and the outlines of their areas. Vector layers
  can take an *Icon*: its points, and its areas at their middle, are then marked with it,
  white on a disc of the layer's colour. The picker searches about 7,900 icons by name and
  keyword: Maki and Temaki, drawn for maps and named after OpenStreetMap's features
  (bollard, cattle grid, lift gate, water tap, fuel), and Material Design Icons for nearly
  everything else. *Size* draws the icon up to three times larger; × goes back to dots.
  Layers that come with an icon, such as OSM queries of a preset, start at 100% opacity
  instead of 50%. *Label* writes a property of each feature beside it (along lines, next
  to points and areas), chosen from the properties its features have; the labels use a
  font of the style that brings the map's fonts, or OpenFreeMap's. OSM query layers show
  their tags and when they were queried; *Update* queries again in the focus area as it is
  now and replaces the layer's data. Other file layers show when their file was changed
  and *Replace*, which takes a newer version of the file and keeps the layer's settings;
  one added from a library file entry or a GeoPDF address also has the arrow that
  downloads the newest file, so refreshing it is a download and a Replace.
- **Show alone** (the stack button under *3D*) draws only the layer whose settings are
  open, over the bottom layer (usually the base map, shown as its eye says). The open
  layer is drawn even when its eye is off. No layer's eye changes, so a second press shows
  the layers as they were; clicking another layer's name shows that one alone instead,
  and closing the settings ends it. Entries of the layers not drawn are greyed meanwhile.
- **3D** (with the map's controls on the right) raises the ground by its elevation, shades
  its relief on the bottom layer (layers above stay unshaded), and tilts the map to show
  it; a second tap levels it again. Elevation comes from
  Mapterhorn's open terrain tiles: about 30 m worldwide, and finer (down to a metre or so)
  where countries publish detailed elevation, such as much of Europe. Tilt and turn the
  map with the right mouse button, Ctrl and drag, or two fingers.
- **Tap a feature** of a vector layer (GeoJSON, GPX, KML, vector tiles, feature services),
  while no route or focus area is being drawn, to see its properties in the details sheet,
  without the ones that only say how a KML file drew it; the map highlights it. A tap
  beside the features closes the sheet. The motorcycle road closures of mintelonline.de
  are read from their names: closed both ways between two places or one way only, when
  (dates, days and hours as written), whether only motorcycles louder than 95 dB are
  meant, the postcode and country, and whether all motor vehicles are kept out.
- **Right-click** a spot on the map (long press on touch screens) to copy its coordinates
  as `lat,lon`, or to open it in Google Maps or Google Street View in a new tab. *Copy
  link* copies an address that opens Layer Slayer at the spot and the zoom of the moment
  (`…/LayerSlayer/#map=15/49.08680,7.71060`; openstreetmap.org's
  `#map=15/49.08680/7.71060` opens too), over the layers of whoever opens it, with a pin
  at the spot that a click removes; the address then loses that ending, so reloading keeps
  the map as it was left. *Show details* asks OpenStreetMap what is there and shows,
  nearest first, the nearest road or trail (type, name, speed limit, one way or not,
  surface, track grade, access), place (type, name, address, phone, website, opening
  hours), barrier (opening hours, lock, access), piece of history (bunker, historic place
  or listed building, former military site or Cold War site known by its name; when it was
  built and given up, whether it is a listed monument, inscription, description, Wikipedia
  article), water (lake, pond, reservoir, river, stream, canal, bay; whether it dries up
  at times) and bridge (its own name, what it carries, weight limit, structure) within
  about 40 pixels, in words rather than tags. A lake or river counts when the spot lies in
  it, however far its shore; a road on a bridge shows as both. At sea, the sea or ocean
  the spot lies in (the North Sea, part of the North Atlantic Ocean) comes from the Marine
  Regions gazetteer. Benches, bins, kerbs, fields and the like are left out; each entry
  links to all its tags on openstreetmap.org. The details open in a sheet beside the map,
  which highlights what they describe in amber; right-click another spot to see its
  details instead.
- **Search** (top left of the map) finds places and addresses with Nominatim,
  OpenStreetMap's search, preferring those in view. Enter searches; the first place found
  gets a pin and the map flies to it, and the list below offers the other places found. ×
  clears the search and the pin.
- **Focus area**, above the layers: *Draw* starts a polygon over the map. Each tap places
  a corner and a tap on the first corner closes it; Backspace or *Undo* takes the last
  corner back, Esc or *Cancel* stops. Every layer but the bottom one then requests tiles
  only within the bounds of the area, and a layer that lies entirely outside them is not
  loaded at all. The bottom layer, usually the base map, loads everywhere for
  orientation, and the map outside the polygon is dimmed. *Redraw* replaces the area, ×
  removes it. While an area is set, Add layer greys out what is known to lie outside it:
  library entries by their region (or their own bounds), and the layers of a service by
  the bounds the service gives.
- **Routes**: *Draw route* starts a route and a toolbar over the map.
  - *Append* adds a point at the end with each tap on the map, *Insert* puts one into the
    line where it is tapped, *Waypoint* places a named pin (with an icon from the same
    sets as layers, if wanted), and *Delete* removes the point or waypoint tapped. A
    waypoint is none of the route's points, but belongs to the route being drawn when it
    is placed: the route's entry counts it, *Fly to* includes it, and deleting the route
    deletes it. The points and waypoints of the route being drawn can be dragged;
    right-click or long-press one for its menu.
  - A route's swatch picks its colour, its *Line* slider the width of its line (0.5 to
    10 px, 4 px unless chosen), and the *Waypoints* slider of a route with waypoints draws
    them up to three times their size, like the icons of a layer. All three are undo
    steps, one per pick or drag.
  - New points are reached along the roads (*Route*, by OSRM with the route's car, bike or
    foot profile) or by a straight line (*Line*), for ways the routing does not know.
  - *Undo* and *Redo* (Ctrl+Z, Ctrl+Shift+Z) step through route and waypoint edits; layer
    changes are not part of it. *Done* or Esc ends drawing.
  - *Export GPX* writes the waypoints and one track per route. *Import GPX* adds a file's
    routes (`<rte>`) with every point routed, and its tracks (`<trk>`) simplified to at
    most 500 points joined by straight lines, so they keep their shape and stay editable.
    A route with the way a Garmin device or BaseCamp calculated for it (Garmin's
    `gpxx:rpt` points) is as good as a track and imported like one, without routing.
    Its waypoints belong to the first of them, or to a route of their own, named after
    the file, if it has none. A leg the routing cannot find stays a red dashed line until
    one of its points is moved.
- **Light and dark**: the interface follows the browser's light or dark preference. The
  sun or moon beside the name switches to the other one, and this browser keeps that
  choice; switching back to the browser's own follows the browser again. The map itself
  is drawn the same in both, on the background its project sets.
- **Narrow screens** (phones): the panel lies under the map, and the chevron beside *Open*
  folds it to its header for more map (it stays folded after a reload). The search is a
  button at the top left that opens it; moving or tapping the map, or Esc, folds it again
  with its pin kept. The route tools are one row of icons, the hint bar naming what the
  active one does.

Layers, their settings, the focus area, routes and the map view are kept in the browser's
local storage, files in IndexedDB, so the map is as it was after a restart. *Save* (top of
the panel) downloads all of it as a `.lslay` file, imported files included, and *Open*
puts such a file in place of what is there: to move to another browser, or to come back
after clearing this one. *Open* also takes the `.webmap` files saved before the app was
renamed from webmap. The CORS proxy address stays in the browser, since it may carry
an account key; which servers go through it is saved.

## How each source is drawn

| Source | Read from | Drawn as |
|---|---|---|
| WMS 1.1.1 / 1.3.0 | GetCapabilities | Raster tiles: a 512 px GetMap per tile with MapLibre's `{bbox-epsg-3857}`, in the service's name for Web Mercator (EPSG:3857, 900913, 102100, …) |
| WMTS 1.0.0 | GetCapabilities | Raster tiles from a tile matrix set that lines up with Web Mercator tiles; RESTful template or KVP |
| ArcGIS MapServer | `?f=json` | Cached Web Mercator services as XYZ tiles, others as `export` images per tile, the whole map or one layer |
| ArcGIS FeatureServer | `?f=json`, and each layer's own description and feature count | Vector tiles: one extent query per tile (a tile query where the layer supports it) answered as GeoJSON and cut into a vector tile in the browser |
| WFS 2.0 / 1.1 | GetCapabilities | Vector tiles like the FeatureServer's: a GetFeature per tile for GeoJSON at the server's own GetFeature address |
| OGC API – Features | landing page or `/collections` | Vector tiles: an items request with a `bbox` per tile, through the collection's GeoJSON items link |
| Vector tiles (MVT) | TileJSON, or a template and two of its tiles | One layer per tile layer, drawn plainly in the layer's colour; a template's layers are read from its zoom 0 tile and its zoom 14 tile where the map is |
| PMTiles | the archive's header and metadata, by range requests | Tiles read from the archive by range requests: vector archives one layer per tile layer like vector tiles, image archives (PNG, JPEG, WebP, AVIF) as raster tiles of the size their tiles have. MapLibre styles that name archives as `pmtiles://` sources are drawn too |
| XYZ template | the template | Raster tiles; `{s}`, `{a-c}`, `{-y}`, `{q}` and `{r}` spellings are converted |
| GeoJSON | URL or file | GeoJSON source, drawn in the layer's colour |
| OSM query | Postpass, or the Overpass API where it fails, within the focus area | GeoJSON (Postpass's own, or converted with osmtogeojson) kept in the browser, drawn in the layer's colour |
| GPX tracks | file | Converted to GeoJSON when imported, a line per track |
| KML / KMZ | file | Placemarks converted to GeoJSON when imported; ground overlays, network links and KML styles are left out |
| MapLibre style | style JSON | The style's own sources and layers |
| Cloud Optimized GeoTIFF | the file's header, by range requests | Raster tiles cut from the file by range requests; imagery in its own colours, single-band data with a colour ramp over the values of its smallest overview. Web Mercator (EPSG:3857) only |
| GeoPDF | file or URL | The map area rendered once to a picture, placed by its corners |

Only Web Mercator is drawn; services that offer no Web Mercator are refused with a reason.

Slow servers often forbid caching too (ArcGIS Online allows five minutes), so tiled layers
(XYZ, WMS, WMTS, ArcGIS, vector tiles, PMTiles) keep their tiles in the browser: tiles
once loaded are answered from the browser's Cache Storage for 24 hours. For layers with
live data, such as radar, untick *Keep tiles in this browser* in the layer's settings.
Settings shows how many tiles are kept and their size, and clears them.

At most four feature queries run at once per server. Feature layers are shown at every
zoom, or from the service's own minimum zoom where it sets one. Zoomed far out, a tile
covers so much that it may hold more features than one query returns (then the most the
server sends); a focus area keeps such queries to the area. WFS servers that cannot answer
in GeoJSON are listed with the reason; WFS 1.0 is not read.

## Routing

Routes are routed by the [FOSSGIS OSRM servers](https://routing.openstreetmap.de/about.html)
with OpenStreetMap data, one leg (two consecutive points) per request and at most one
request per second, as they ask. A leg that cannot be routed is drawn red and dashed and
can be retried; legs still waiting are grey and dashed. The route tool is the one of
[mappic](https://github.com/c0dev0id/mappic).

## CORS and the proxy

A WebGL map can only draw images from servers that allow it (CORS headers). Most public
map services do; some do not. Libraries that draw tiles as plain `<img>` elements, as
Leaflet and OpenLayers do by default, need no CORS, so a service can work there and still
be refused here. For those, Settings takes the address of a CORS proxy you
run, with `{url}` where the target address goes (percent-encoded), e.g.
`https://proxy.example/?url={url}`; without `{url}` the target is appended as it is.
Only the hosts you choose go through it: tick *Fetch … through the CORS proxy* on a
layer, or use the button an error offers; library entries marked *proxy* use it from the
first request. On a page served over HTTPS, plain-HTTP addresses are upgraded to HTTPS
unless their host goes through the proxy. A failed layer shows the reason the server or
the proxy gave. Free plans of public proxies often pass text only: corsproxy.io's free
plan reads capabilities and feature data but refuses map images, which its paid plans
pass. Keeping a proxied layer's tiles in the browser spares the proxy's request quota.
PMTiles archives are read by range requests, so their server must allow CORS for them
(GET with a `Range` header); a proxy for them has to pass range requests and binary
answers, which corsproxy.io's free plan refuses. A file whose server allows no CORS can
still be downloaded by a link and opened from disk, which is what the library's file
entries offer.

## The library

`src/library/library.json` holds the services offered in the library, each with its type,
region and category: the services of [WMSproxy](https://github.com/c0dev0id/WMSproxy),
the base maps of [mappic](https://github.com/c0dev0id/mappic), and WFS, OGC API, vector
tile and ArcGIS services added since, among them the public US layers outdoor apps draw
on (land managers, forest and park roads and trails, wilderness, mines, fire, smoke and
air quality). Entries of type `file` are files the user downloads by a link and opens,
for servers that do not let web pages read them.

Data whose provider keeps it to its own site, by its terms or by refusing requests from
other pages, is left out even where it could be fetched, as Rumo's PMTiles archives and
styles and OsmAnd's off-road tiles are.

`npm run check-library` reads every entry with the app's own parsers, prints how many
layers each offers and can show, and marks entries whose server sends no valid CORS header
with `"cors": false`, which the library shows as needing a proxy. File entries are only
checked to be there. It reads live services, so it runs by hand rather than in CI.

## Development

```sh
npm ci
npm run dev            # development server
npm test               # unit tests (Vitest)
npm run typecheck      # TypeScript
npm run build          # production build in dist/
npm run check-library  # check the library against the live services
```

## Deployment

The Build workflow type-checks, tests and builds every push. On `main` it also deploys
`dist/` to GitHub Pages; the repository's Pages source must be set to *GitHub Actions*
(Settings → Pages).
