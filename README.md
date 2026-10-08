# <img src="public/logo.png" alt="" width="40" align="top"> Layer Slayer

A map viewer for the web that stacks base maps and overlays from many kinds of map
services: WMS, WMTS, WFS, OGC API – Features, ArcGIS MapServer and FeatureServer, XYZ tile
templates, vector tiles, MapLibre styles, Cloud Optimized GeoTIFF, GeoJSON, GPX, KML and
GeoPDF, and draws routes over them with GPX export and import. Each service is read the way it describes itself (capabilities
documents, service descriptions, georeferencing in the PDF) and drawn with the MapLibre
source that fits it, rather than turned into raster tiles by a proxy.

It is a static page built with SolidJS and MapLibre GL JS and deployed to GitHub Pages by
GitHub Actions. Its code name, used by the repository, browser storage and the `.webmap`
project files, is webmap. Nothing runs on a server; layers, routes, settings and imported files stay
in the browser.

## Using it

- **Add layer** opens the library, an address field, a file picker and OSM Query. The dialog stays
  open until *Close*: a tap adds a layer in the background and a second tap removes it,
  and what is on the map is highlighted.
  - The **library** lists services by region and category. A service with a single layer
    is added or removed by tapping its entry; others open their list of layers, and
    *‹ Sources* goes back to the library as it was left. Tapping a group adds what of it
    is missing, or removes it when all of it is on the map. Layers a service cannot show
    in Web Mercator are listed with the reason.
  - An **address** can be a WMS, WMTS or WFS capabilities URL, an OGC API – Features
    landing page or collection, an ArcGIS MapServer or FeatureServer (or one of its
    layers), a tile template with `{z}/{x}/{y}` (raster, or vector tiles ending in `.pbf`
    or `.mvt`), a TileJSON, a GeoJSON file, a MapLibre style, a Cloud Optimized GeoTIFF
    or a GeoPDF. The kind of service is guessed from the address
    and can be changed. *Open* shows the source's layers.
  - **Files**: GeoJSON, the tracks of GPX files (routes and waypoints in a GPX file are
    imported under Routes), the placemarks of KML and KMZ files, and GeoPDFs with an ISO
    32000 geospatial viewport, added as they are chosen. Each new GeoJSON, GPX or KML
    layer takes the next colour of a palette, which its settings can change.
  - **OSM Query** makes a layer of OpenStreetMap features in the focus area, found with
    the Overpass API; without a focus area it offers to draw one, since Overpass answers
    queries for limited areas only. Choose features from the list, which starts with
    what matters off the road: tracks by grade, unpaved and rough ways, fords, trails
    rated for mountain bikes and hikers, gates, barriers and ways closed to motor
    vehicles, then roads, fuel and repair, water, camp sites and about a hundred more,
    each with the tags it stands for and its icon. Or type tags and *Add* them: `key=value`, or
    `key=*` for any value, with tags separated by spaces all having to match, e.g.
    `highway=track tracktype=grade4`. *Query* finds everything chosen in one layer,
    named after it, with the icon of the first chosen feature that has one; the icon
    button next to the name picks another, or none. The result is kept in the browser as
    GeoJSON.
- The **layer list** shows the top layer first. Drag a layer by its handle (or press the
  arrow keys on it) to change the order; the eye hides it, the pencil renames it, × removes
  it, and the frame icon flies to the area the layer covers (layers that span most of the
  world have none). A layer shown in grey italics is outside its zoom range at the current
  zoom; a red triangle carries the last error loading it. Under each name, a small line
  shows its opacity, colour, zoom range (z5–15), and *cache* and *proxy* where its
  tiles are kept or its server goes through the CORS proxy. *Background*, below the last
  layer, sets the colour the map is drawn on (white unless chosen); it shows wherever the
  layers leave the map uncovered or see-through.
- Below the list, the **active layer** (click a name) has its opacity, zoom range, colour
  (vector layers), source, the CORS proxy for its server and, for tiled layers, whether it
  keeps its tiles in the browser. New layers start at 50% opacity. Raster layers (XYZ, WMS,
  WMTS, ArcGIS MapServer, GeoTIFF, placed images) have *Colour adjustments*: hue, saturation,
  contrast, and the brightness black and white become. Black at 100% and white at 0%
  inverts the image; with the hue turned 180° that gives a dark map that keeps its colours.
  ArcGIS feature layers can be *drawn with the service's own symbols* (simple, unique value
  and class breaks renderers with simple and picture symbols) instead of their colour.
  Vector layers can take an *Icon*: its points, and its areas at their middle, are then
  marked with it, white on a disc of the layer's colour. The picker searches about 7,900
  icons by name and keyword: Maki and Temaki, drawn for maps and named after OpenStreetMap's
  features (bollard, cattle grid, lift gate, water tap, fuel), and Material Design Icons
  for nearly everything else. *Size* draws the icon up to three times larger; × goes back
  to dots. Layers that come with an icon, such as OSM queries of a preset, start at 100%
  opacity instead of 50%.
  OSM query layers show their tags and when they were queried; *Update* queries again in
  the focus area as it is now and replaces the layer's data.
- **Search** (top left of the map) finds places and addresses with Nominatim, OpenStreetMap's
  search, preferring those in view. Enter searches; the first place found gets a pin and the
  map flies to it, and the list below offers the other places found. × clears the search
  and the pin.
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
    sets as layers, if wanted), and *Delete* removes the point or waypoint tapped. Points and waypoints can be dragged; right-click or long-press one
    for its menu.
  - New points are reached along the roads (*Route*, by OSRM with the route's car, bike or
    foot profile) or by a straight line (*Line*), for ways the routing does not know.
  - *Undo* and *Redo* (Ctrl+Z, Ctrl+Shift+Z) step through route and waypoint edits; layer
    changes are not part of it. *Done* or Esc ends drawing.
  - *Export GPX* writes the waypoints and one track per route. *Import GPX* adds a file's
    waypoints, its routes (`<rte>`) with every point routed, and its tracks (`<trk>`)
    simplified to at most 500 points joined by straight lines, so they keep their shape
    and stay editable. A leg the routing cannot find stays a red dashed line until one of
    its points is moved.

Layers, their settings, the focus area, routes and the map view are kept in the browser's local storage,
files in IndexedDB, so the map is as it was after a restart.
*Save* (top of the panel) downloads all of it as a `.webmap` file, imported files
included, and *Open* puts such a file in place of what is there: to move to another
browser, or to come back after clearing this one. The CORS proxy address stays in the
browser, since it may carry an account key; which servers go through it is saved.

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
| XYZ template | the template | Raster tiles; `{s}`, `{a-c}`, `{-y}`, `{q}` and `{r}` spellings are converted |
| GeoJSON | URL or file | GeoJSON source, drawn in the layer's colour |
| OSM query | the Overpass API, within the focus area | Converted to GeoJSON (osmtogeojson) once and kept in the browser, drawn in the layer's colour |
| GPX tracks | file | Converted to GeoJSON when imported, a line per track |
| KML / KMZ | file | Placemarks converted to GeoJSON when imported; ground overlays, network links and KML styles are left out |
| MapLibre style | style JSON | The style's own sources and layers |
| Cloud Optimized GeoTIFF | the file's header, by range requests | Raster tiles cut from the file by range requests; imagery in its own colours, single-band data with a colour ramp over the values of its smallest overview. Web Mercator (EPSG:3857) only |
| GeoPDF | file or URL | The map area rendered once to a picture, placed by its corners |

Only Web Mercator is drawn; services that offer no Web Mercator are refused with a reason.

Slow servers often forbid caching too (ArcGIS Online allows five minutes), so tiled layers
(XYZ, WMS, WMTS, ArcGIS) keep their tiles in the browser: tiles once loaded are answered
from the browser's Cache Storage for 24 hours. For layers with live data, such as radar,
untick *Keep tiles in this browser* in the layer's settings. Settings shows how many tiles
are kept and their size, and clears them.

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

## The library

`src/library/library.json` holds the services offered in the library: the services of
[WMSproxy](https://github.com/c0dev0id/WMSproxy), the base maps of
[mappic](https://github.com/c0dev0id/mappic), and WFS, OGC API and vector tile services,
each with its type, region and category.

`npm run check-library` reads every entry with the app's own parsers, prints how many
layers each offers and can show, and marks entries whose server sends no valid CORS header
with `"cors": false`, which the library shows as needing a proxy. It reads live services,
so it runs by hand rather than in CI.

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
