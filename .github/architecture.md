# Architecture

## High-level architecture

Everything runs in the browser. The remote services are the map services a user adds and
the public services the app asks itself. The dotted path is the optional CORS proxy.

```mermaid
flowchart LR
  subgraph app["Browser: Layer Slayer, a static page"]
    ui["UI<br/>panel, dialogs, map tools"]
    stores["Stores<br/>layers, settings, view, routes"]
    readers["Readers and queries<br/>service descriptions, files, OSM"]
    composer["Style composer<br/>layers to one MapLibre style"]
    maplibre["MapLibre GL JS<br/>map and tile workers"]
    protocols["Protocol handlers<br/>features, wmts-matrix, pmtiles, cog, cache+"]
    routing["Routing pump<br/>one OSRM leg at a time"]
    net["Network<br/>HTTPS upgrade, CORS proxy per host"]
  end
  subgraph storage["Browser storage"]
    local[("Local storage<br/>layers, settings, view, routes")]
    idb[("IndexedDB<br/>imported files")]
    cache[("Cache Storage<br/>kept tiles")]
  end
  subgraph remote["Remote services"]
    services["Map services<br/>WMS, WMTS, WFS, ArcGIS, OGC API, tiles, files"]
    proxy["CORS proxy<br/>optional, run by the user"]
    osm["OSM services<br/>Postpass, Overpass, Nominatim, Marine Regions"]
    assets["OpenFreeMap glyphs<br/>Mapterhorn elevation"]
    osrm["OSRM<br/>routing.openstreetmap.de"]
  end
  ui --> stores
  ui --> readers
  readers -->|layer drafts| stores
  stores --> composer --> maplibre
  maplibre -->|custom schemes| protocols
  stores <--> local
  stores <--> idb
  protocols <--> cache
  stores <-->|legs| routing
  readers --> net
  protocols --> net
  maplibre -->|transformRequest| net
  net --> services
  net -.-> proxy -.-> services
  net --> osm
  net --> assets
  routing --> osrm
```

## Block diagram

```mermaid
flowchart TB
  tools["Build time<br/>tools/"]
  subgraph app["Layer Slayer in the browser"]
    direction TB
    presentation["Presentation<br/>ui/, map/*.tsx"]
    state["Application state<br/>state/"]
    domain["Domain<br/>services/, routing/, map/*.ts"]
    network["Network<br/>state/net.ts"]
    foundation["Foundation<br/>model/, geo/"]
    presentation --> state --> domain
    domain --> network
    domain --> foundation
  end
  platform["Platform<br/>SolidJS, MapLibre GL JS, browser storage"]
  tools -.->|virtual modules| app
  app --> platform
```

| Layer | Contents |
|---|---|
| Presentation | The panel and its dialogs (`ui/`); the map view, toolbar, route editor, context menu and search box (`map/*.tsx`). |
| Application state | The layer store with settings, view and focus area; the route store with undo and redo; local storage, stored files and project files (`state/`). |
| Domain | Service readers and file import (`services/`); route edits, legs and the OSRM pump (`routing/`); style composition, overlays, protocol handlers, feature tiles and the tile cache (`map/*.ts`). |
| Network | HTTPS upgrade, the per-host CORS proxy and readable errors for every request but routing (`state/net.ts`). |
| Foundation | Layer, route and icon types (`model/`); Web Mercator, bounds and geometry (`geo/`). |
| Build time (secondary) | Vite plugins that serve the service library and the icon sets as virtual modules (`tools/`). |
| Platform (secondary) | SolidJS, MapLibre GL JS, local storage, IndexedDB, Cache Storage. |

The arrows show the main direction of use. The layers follow responsibility and are not
enforced on imports: upper layers also use lower ones directly, and some domain modules
read the stores.

## Persisted data

```mermaid
erDiagram
  APP_STATE ||--o{ LAYER : "layers, bottom first"
  APP_STATE ||--|| SETTINGS : has
  APP_STATE ||--|| VIEW : has
  LAYER ||--|| LAYER_SOURCE : "draws from"
  LAYER_SOURCE |o..o| STORED_FILE : "file key"
  LAYER_SOURCE |o--o| OSM_QUERY : "made by"
  LAYER_SOURCE ||..o{ KEPT_TILE : "tile addresses"
  ROUTE_DATA ||--o{ ROUTE : routes
  ROUTE_DATA ||--o{ WAYPOINT : waypoints
  ROUTE ||--|{ ROUTE_POINT : "points, in order"
  ROUTE ||--o{ WAYPOINT : owns

  APP_STATE {
    string activeLayerId
    list focus "corners of the focus area"
  }
  SETTINGS {
    string proxy "browser only"
    list proxiedHosts
    string background
    boolean terrain
    boolean tileCacheOff "browser only"
    string proxyMode "browser only"
  }
  VIEW {
    lnglat center
    number zoom
    number bearing
    number pitch
  }
  LAYER {
    string id PK
    string name
    boolean visible
    number opacity
    number minzoom
    number maxzoom
    boolean cache
    string origin
  }
  LAYER_SOURCE {
    string type "one of twelve source kinds"
    string url "or data as a file key"
  }
  OSM_QUERY {
    list filters
    string queried "ISO 8601 time"
  }
  STORED_FILE {
    string key PK
    blob data
  }
  KEPT_TILE {
    string address PK "tile URL or feature query"
    string expires "time, or never when precached"
  }
  ROUTE {
    string id PK
    string name
    string profile "car, bike or foot"
    string color
    map legs "polyline6 per routed leg"
  }
  ROUTE_POINT {
    string id PK
    lnglat lngLat
    boolean straight
  }
  WAYPOINT {
    string id PK
    string routeId FK
    lnglat lngLat
    string name
  }
```

| Data | Kept in |
|---|---|
| APP_STATE with its layers, settings and view | Local storage, key `layerslayer` |
| ROUTE_DATA with its routes and waypoints | Local storage, key `layerslayer-routes` |
| STORED_FILE | IndexedDB, database `layerslayer`, store `files` |
| KEPT_TILE | Cache Storage, cache `layerslayer-tiles-v2` |

A project file (`.lslay`) is a ZIP archive of APP_STATE without the browser-only settings,
ROUTE_DATA, and the stored files of its layers.
