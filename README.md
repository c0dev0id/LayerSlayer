# <img src="public/logo.png" alt="" width="40" align="top"> Layer Slayer

A static, server-less map viewer that stacks base maps and overlays from many kinds of
map service and draws routes over them. For anyone who needs to combine layers no single
viewer handles: a WMS next to a PMTiles archive next to a live OpenStreetMap query.

It runs at <https://shagen.me/LayerSlayer/>, built with SolidJS and MapLibre GL JS.
Nothing runs on a server; layers, routes, settings and imported files stay in the browser.

## Features

- **Many source kinds** — each read the way it describes itself, then drawn with the
  MapLibre source that fits, rather than flattened to raster tiles by a proxy.
- **Service library** — about 150 ready-made services and files, by region and category,
  with search.
- **Layer control** — order, visibility, opacity, zoom range, colour, line style, labels,
  raster colour adjustments, and icons from about 7,900 symbols.
- **OSM queries** — build a layer of OpenStreetMap features in an area, from a preset list
  or typed tags.
- **Routing** — draw routes along roads (OSRM) or straight, with waypoints, undo/redo and
  GPX import and export.
- **Spot details** — right-click anywhere for what OpenStreetMap knows there, in plain
  words.
- **3D terrain** — hillshaded relief from open worldwide elevation tiles.
- **Focus area** — a polygon that limits requests and dims the map around it, with
  precaching for later.
- **Stays in the browser** — tiles kept per layer, everything survives a restart, and a
  whole setup travels as one `.lslay` project file.
- **Light and dark** — follows the browser, or switch by hand.

## Supported sources

| Source | Drawn as |
|---|---|
| WMS 1.1.1 / 1.3.0 | Raster tiles, one GetMap per tile |
| WMTS 1.0.0 | Raster tiles from a Web Mercator matrix set |
| ArcGIS MapServer | XYZ tiles, or `export` images per tile |
| ArcGIS FeatureServer | Vector tiles, queried per tile |
| WFS 2.0 / 1.1 | Vector tiles, a GetFeature per tile |
| OGC API – Features | Vector tiles, a `bbox` items request per tile |
| Vector tiles (MVT) | One layer per tile layer |
| PMTiles | Vector or raster tiles read from the archive |
| XYZ template | Raster tiles |
| GeoJSON | GeoJSON source |
| OSM query | GeoJSON from Postpass or Overpass |
| GPX / KML / KMZ | Tracks and placemarks as GeoJSON |
| MapLibre style | The style's own sources and layers |
| Cloud Optimized GeoTIFF | Raster tiles cut from the file |
| GeoPDF | The map area as an image placed by its corners |

Web Mercator only: a service that offers no Web Mercator is listed with the reason, never
reprojected.

## The CORS proxy

A WebGL map can only draw images from servers that send CORS headers. Most public services
do; some do not, and work only in viewers that draw tiles as plain `<img>` (Leaflet,
OpenLayers). For those, Settings takes the address of a CORS proxy you run, with `{url}`
where the target goes. Only the hosts you choose go through it. No proxy is built in.
