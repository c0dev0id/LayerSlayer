# Core features

- Layers from WMS, WMTS, WFS, OGC API – Features, ArcGIS MapServer and FeatureServer, XYZ
  templates, vector tiles, PMTiles archives, MapLibre styles, Cloud Optimized GeoTIFF,
  GeoJSON (URL or file), GPX tracks and KML or KMZ placemarks (file) and GeoPDF (file or
  URL).
- A library of about 180 services and files by region and category, with search.
- An add-layer dialog that stays open: layers and groups toggle with a tap, what is on
  the map is highlighted, and the library and a service's layers can be switched between
  freely. Every layer a service offers is listed, with reasons for those it cannot show
  and a filter for services with hundreds of layers.
- WMS layers with maps of several times drawn at the time chosen in their settings.
- Layer list with drag and keyboard reordering, visibility, removal, flying to the layer's
  area, opacity, zoom range, colour and line style for vector layers, colour adjustments
  for raster layers, and per-layer error marks.
- Tile addresses for apps that fill them in themselves, such as DMD2: a raster layer that
  has one shows it in its settings, tagged DMD in the layer list and on library entries
  whose layers all have one.
- Labels for vector layers from a feature property, in a chosen colour and size with an
  outline of a chosen colour and width, beside the points' dots or, with the dots switched
  off, on their own; and the properties of a tapped feature in words in the details sheet.
- A map button that shows the open layer alone over the base map, leaving every layer's
  visibility as it was.
- A fullscreen button on the map that shows the map alone, without the panel and the
  other controls, and brings them back when pressed again or on Esc.
- File layers that take a newer version of their file, keeping their settings; library
  entries for files that pages may not read, downloaded by a link, among them the
  motorcycle road closures of mintelonline.de, read from their names.
- Tiles of slow layers kept in the browser for a day, per layer, and a limit on parallel
  feature queries per server.
- Precaching the focus area: chosen layers and zooms, an estimate of tiles and size as
  they are chosen, a polite run kept until the cache is cleared, and its progress.
- Place and address search (Nominatim) with a pin on the place found.
- A menu for any spot on the map: its details from OSM (nearest road or trail, place,
  barrier, piece of history, water and bridge, in words) and the sea it lies in, its
  coordinates, a link that opens Layer Slayer there, Google Maps and Street View (Google's
  documented Maps URLs, no key).
- 3D terrain with hillshading from Mapterhorn's open elevation tiles, under a day or a
  night sky, switched by a button on the map from flat to day to night.
- Icons for vector layers from about 7,900 (Maki, Temaki, Material Design Icons), white on
  a disc of the layer's colour, picked by search; OSM presets come with theirs.
- OSM query layers: OpenStreetMap features in the focus area, chosen from a list of about
  170 led by what off-road riders look for (tracks, trails, surfaces, barriers, access)
  or typed as tags, queried once (Postpass, Overpass where Postpass fails) and updated
  on demand. Place presets (countries down to farms and named localities) show names
  alone.
- Optional CORS proxy, used per host.
- Light and dark interface, following the browser unless switched.
- A focus area: a polygon outside whose bounds no layer requests tiles, with the map
  around it covered in the dimmed background colour, showing the world's coastlines and
  borders on a smaller scale, with the area raised over its place on them and casting a
  shadow that keeps its side as the map turns and tilts; outline and shadow colours can
  be chosen.
- Route drawing over the layers: routed or straight legs, insert, drag and delete points,
  waypoints, undo and redo, car, bike and foot profiles, recalculation of a whole route,
  GPX export and import. Each route has its own colour, line width and outline, and its
  waypoints their own size, pin colour and name colour, size and box colour. A waypoint is
  a pin, with a symbol of choice, or one of ten little objects standing on the map: start
  and finish flags, a camera for a photo spot, a meeting point sign, a pause sign for a
  break, a plate, a coffee cup, a fuel pump, a warning triangle and an information sign.
  Waypoints shrink as the map zooms out, and in 3D with distance. A route's line can be
  coloured along its length instead: a rainbow from start to end, elevation, slope either
  way, or road surface, each with a legend.
- Layers, routes, settings, view and imported files survive a browser restart, and go
  to another browser as a `.lslay` project file (`.webmap` files from before the
  rename still open).
