# webmap

A map viewer for the web that stacks base maps and overlays from many kinds of map
services: WMS, WMTS, ArcGIS MapServer and FeatureServer, XYZ tile templates, MapLibre
styles, GeoJSON and GeoPDF. Each service is read the way it describes itself (capabilities
documents, service descriptions, georeferencing in the PDF) and drawn with the MapLibre
source that fits it, rather than turned into raster tiles by a proxy.

It is a static page built with SolidJS and MapLibre GL JS and deployed to GitHub Pages by
GitHub Actions. Nothing runs on a server; layers, settings and imported files stay in the
browser.

## Using it

- **Add layer** opens the library, an address field and a file picker. The dialog stays
  open until *Close*: a tap adds a layer in the background and a second tap removes it,
  and what is on the map is highlighted.
  - The **library** lists services by region and category. A service with a single layer
    is added or removed by tapping its entry; others open their list of layers, and
    *‹ Sources* goes back to the library as it was left. Tapping a group adds what of it
    is missing, or removes it when all of it is on the map. Layers a service cannot show
    in Web Mercator are listed with the reason.
  - An **address** can be a WMS or WMTS capabilities URL, an ArcGIS MapServer or
    FeatureServer (or one of its layers), a tile template with `{z}/{x}/{y}`, a GeoJSON
    file, a MapLibre style or a GeoPDF. The kind of service is guessed from the address
    and can be changed. *Open* shows the source's layers.
  - **Files**: GeoJSON, and GeoPDFs with an ISO 32000 geospatial viewport, added as they
    are chosen.
- The **layer list** shows the top layer first. Drag a layer by its handle (or press the
  arrow keys on it) to change the order; the eye hides it, × removes it, and the frame
  icon flies to the area the layer covers (layers that span most of the world have none).
  A layer shown in grey italics is outside its zoom range at the current zoom; a red
  triangle carries the last error loading it.
- Below the list, the **active layer** (click a name) has its name, opacity, zoom range,
  colour (vector layers), source, the CORS proxy for its server and, for tiled layers,
  whether it keeps its tiles in the browser.

Layers, their settings and the map view are kept in the browser's local storage, files
in IndexedDB, so the map is as it was after a restart.

## How each source is drawn

| Source | Read from | Drawn as |
|---|---|---|
| WMS 1.1.1 / 1.3.0 | GetCapabilities | Raster tiles: a 512 px GetMap per tile with MapLibre's `{bbox-epsg-3857}`, in the service's name for Web Mercator (EPSG:3857, 900913, 102100, …) |
| WMTS 1.0.0 | GetCapabilities | Raster tiles from a tile matrix set that lines up with Web Mercator tiles; RESTful template or KVP |
| ArcGIS MapServer | `?f=json` | Cached Web Mercator services as XYZ tiles, others as `export` images per tile, the whole map or one layer |
| ArcGIS FeatureServer | `?f=json`, and each layer's own description and feature count | Vector tiles: one extent query per tile (a tile query where the layer supports it) answered as GeoJSON and cut into a vector tile in the browser |
| XYZ template | the template | Raster tiles; `{s}`, `{a-c}`, `{-y}`, `{q}` and `{r}` spellings are converted |
| GeoJSON | URL or file | GeoJSON source, drawn in the layer's colour |
| MapLibre style | style JSON | The style's own sources and layers |
| GeoPDF | file or URL | The map area rendered once to a picture, placed by its corners |

Only Web Mercator is drawn; services that offer no Web Mercator are refused with a reason.

Slow servers often forbid caching too (ArcGIS Online allows five minutes). A tiled layer
(XYZ, WMS, WMTS, ArcGIS) can keep its tiles in the browser: tick *Keep tiles in this
browser* in its settings, and tiles once loaded are answered from the browser's Cache
Storage for 24 hours. New feature layers keep their tiles from the start. Settings shows
how many tiles are kept and clears them.

At most four feature queries run at once per server. A feature layer whose features all fit
in one query is shown at every zoom; a larger one starts at zoom 9, or at the service's own
minimum zoom where that is higher, since at lower zooms each tile covers so much that the
server returns its whole record limit for it. The zoom range of the layer widens that.

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
plan reads capabilities and feature data but refuses map images.

## The library

`src/library/library.json` holds the services offered in the library: the services of
[WMSproxy](https://github.com/c0dev0id/WMSproxy) and the base maps of
[mappic](https://github.com/c0dev0id/mappic), each with its type, region and category.

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
