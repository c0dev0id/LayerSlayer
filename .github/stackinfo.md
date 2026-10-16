# Software stack

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
