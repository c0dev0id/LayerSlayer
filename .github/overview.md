# Overview

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
