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

- **Add layer** opens the library, an address field and a file picker.
  - The **library** lists services by region and category. Opening one reads what it
    offers; a service with a single layer is added at once, others list their layers to
    pick from. Layers a service cannot show in Web Mercator are listed with the reason.
  - An **address** can be a WMS or WMTS capabilities URL, an ArcGIS MapServer or
    FeatureServer (or one of its layers), a tile template with `{z}/{x}/{y}`, a GeoJSON
    file, a MapLibre style or a GeoPDF. The kind of service is guessed from the address
    and can be changed.
  - **Files**: GeoJSON, and GeoPDFs with an ISO 32000 geospatial viewport.
- The **layer list** shows the top layer first. Drag a layer by its handle (or press the
  arrow keys on it) to change the order; the eye hides it, × removes it. A layer shown in
  grey italics is outside its zoom range at the current zoom; a red triangle carries the
  last error loading it.
- Below the list, the **active layer** (click a name) has its name, opacity, zoom range,
  colour (vector layers), source and, where its bounds are known, *Zoom to layer*.

Layers, their settings and the map view are kept in the browser's local storage, files
in IndexedDB, so the map is as it was after a restart.

## How each source is drawn

| Source | Read from | Drawn as |
|---|---|---|
| WMS 1.1.1 / 1.3.0 | GetCapabilities | Raster tiles: a 512 px GetMap per tile with MapLibre's `{bbox-epsg-3857}`, in the service's name for Web Mercator (EPSG:3857, 900913, 102100, …) |
| WMTS 1.0.0 | GetCapabilities | Raster tiles from a tile matrix set that lines up with Web Mercator tiles; RESTful template or KVP |
| ArcGIS MapServer | `?f=json` | Cached Web Mercator services as XYZ tiles, others as `export` images per tile, the whole map or one layer |
| ArcGIS FeatureServer | `?f=json` | Vector tiles: one extent query per tile answered as GeoJSON and cut into a vector tile in the browser |
| XYZ template | the template | Raster tiles; `{s}`, `{a-c}`, `{-y}`, `{q}` and `{r}` spellings are converted |
| GeoJSON | URL or file | GeoJSON source, drawn in the layer's colour |
| MapLibre style | style JSON | The style's own sources and layers |
| GeoPDF | file or URL | The map area rendered once to a picture, placed by its corners |

Only Web Mercator is drawn; services that offer no Web Mercator are refused with a reason.

## CORS and the proxy

A WebGL map can only draw images from servers that allow it (CORS headers). Most public
map services do; some do not. For those, Settings takes the address of a CORS proxy you
run, with `{url}` where the target address goes (percent-encoded), e.g.
`https://proxy.example/?url={url}`; without `{url}` the target is appended as it is.
Only the hosts you choose go through it: tick *Fetch … through the CORS proxy* on a
layer, or use the button an error offers. On a page served over HTTPS, plain-HTTP
addresses are upgraded to HTTPS unless their host goes through the proxy.

## The library

`src/library/library.json` holds the services offered in the library: the services of
[WMSproxy](https://github.com/c0dev0id/WMSproxy) and the base maps of
[mappic](https://github.com/c0dev0id/mappic), each with its type, region and category.

`npm run check-library` reads every entry with the app's own parsers, prints how many
layers each offers and can show, and marks entries whose server sends no CORS headers
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
