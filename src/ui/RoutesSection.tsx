import { createMemo, createSignal, For, Show } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { geojsonBounds } from '../geo/bounds';
import { lineWidth } from '../model/line';
import { PROFILES, ROUTE_LINE_WIDTH, routeOutline, waypointLook, type LngLat, type Profile, type Route } from '../model/route';
import { ROUTE_COLORINGS, type RouteColoring } from '../model/routeColoring';
import { retryColoring } from '../state/routeColoring';
import { gpxToRouteData, routeTracks } from '../routing/gpx';
import { routedLegs, routePoints } from '../routing/legs';
import { ROUTING_MIN_INTERVAL_MS } from '../routing/osrm';
import { nextRouteColor } from '../routing/routeEdit';
import { failedLegCount, lastError, pendingLegs, recalculateRoute, retryFailedLegs } from '../routing/service';
import { editingRouteId, startDrawing, stopDrawing } from '../state/drawing';
import {
  addRoute,
  endGesture,
  importRouteData,
  removeRoute,
  renameRoute,
  resetRouteOutline,
  resetWaypointLook,
  routeData,
  routeWaypoints,
  setRouteColor,
  setRouteColoring,
  setRouteLineWidth,
  setRouteOutline,
  setRouteProfile,
  setWaypointLook,
  setWaypointSize,
} from '../state/routes';
import { parseGpx, toGpx } from '../services/gpx';
import { fileName } from '../services/read';
import { theme } from '../state/theme';
import { errorMessage, showBounds } from '../state/ui';
import { askConfirmation } from './confirm';
import { downloadBlob } from './download';
import { EditableName } from './EditableName';
import { durationText } from './format';
import { IconSizeSlider } from './IconSizeSlider';
import { LineWidthSlider } from './LineWidthSlider';
import { AreaIcon, CloseIcon, PaletteIcon, RefreshIcon } from './icons';
import { OutlineWidthSlider } from './OutlineWidthSlider';
import { ColoringLegend } from './ColoringLegend';
import { StylePopover } from './StylePopover';
import { TextSizeSlider } from './TextSizeSlider';

/** A number with the word it counts, as `3 points`. */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** New routes and imported GPX routes use the profile of the last route. */
const lastProfile = (): Profile => routeData.routes.at(-1)?.profile ?? 'car';

function drawNewRoute() {
  const id = crypto.randomUUID();
  addRoute({
    id,
    name: `Route ${routeData.routes.length + 1}`,
    profile: lastProfile(),
    color: nextRouteColor(routeData.routes),
    points: [],
    legs: {},
  });
  startDrawing(id);
}

async function importGpx(file: File): Promise<void> {
  const data = gpxToRouteData(parseGpx(await file.text()), {
    fileName: fileName(file.name),
    profile: lastProfile(),
    existing: routeData.routes,
    newId: () => crypto.randomUUID(),
  });
  if (data.routes.length === 0 && data.waypoints.length === 0) throw new Error(`${file.name} holds no routes, tracks or waypoints.`);
  importRouteData(data, 'Import GPX');
  showPoints([...data.routes.flatMap((r) => r.points.map((p) => p.lngLat)), ...data.waypoints.map((w) => w.lngLat)]);
}

function showPoints(points: LngLat[]) {
  const bounds = geojsonBounds({ type: 'MultiPoint', coordinates: points });
  if (bounds) showBounds(bounds);
}

async function exportGpx() {
  const unrouted = pendingLegs() + failedLegCount();
  const message = `${count(unrouted, 'leg is', 'legs are')} not routed and will be exported as straight lines.`;
  if (unrouted > 0 && !(await askConfirmation(message, 'Export anyway'))) return;
  const tracks = routeTracks(unwrap(routeData.routes));
  const gpx = toGpx('Routes', unwrap(routeData.waypoints), tracks, new Date());
  downloadBlob(new Blob([gpx], { type: 'application/gpx+xml' }), 'routes.gpx');
}

/** Moves the view to show the whole route, detours of routed legs and its waypoints included. */
function flyToRoute(route: Route) {
  const plain = unwrap(route);
  showPoints([...plain.points.map((p) => p.lngLat), ...routePoints(plain), ...routeWaypoints(route.id).map((w) => w.lngLat)]);
}

/** Above this many legs, recalculating a route asks first: routed one a second, they take minutes. */
const RECALCULATE_WARNING_LEGS = 500;

async function recalculate(route: Route) {
  const legs = routedLegs(route).length;
  const time = durationText((legs * ROUTING_MIN_INTERVAL_MS) / 1000);
  const message = `Recalculating "${route.name}" routes its ${legs} legs again, about one a second: that takes at least ${time}. Until a leg is routed, it is drawn as a straight line.`;
  if (legs > RECALCULATE_WARNING_LEGS && !(await askConfirmation(message, 'Recalculate'))) return;
  recalculateRoute(route.id);
}


/** The routes drawn on the map: draw, edit, import and export them as GPX. */
export function RoutesSection() {
  const [importError, setImportError] = createSignal<string>();
  const exportable = () => routeData.waypoints.length > 0 || routeData.routes.some((r) => r.points.length >= 2);
  return (
    <section class="section">
      <div class="row">
        <h2 class="grow">Routes</h2>
        <label class="button" title="Add the routes, tracks and waypoints of a GPX file">
          Import GPX
          <input
            type="file"
            hidden
            accept=".gpx,application/gpx+xml"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              setImportError(undefined);
              try {
                await importGpx(file);
              } catch (error) {
                setImportError(errorMessage(error));
              }
            }}
          />
        </label>
        <button class="primary" onClick={drawNewRoute}>
          Draw route
        </button>
      </div>
      <Show when={routeData.routes.length === 0}>
        <p class="muted hint">Trace a tour on the map, routed along the roads; each route becomes a track in the GPX export.</p>
      </Show>
      <Show when={importError()}>{(message) => <p class="note error">{message()}</p>}</Show>
      <ul class="routes">
        <For each={routeData.routes}>{(route) => <RouteRow route={route} />}</For>
      </ul>
      <Show when={pendingLegs() > 0}>
        <p class="muted hint">
          Routing… {count(pendingLegs(), 'leg', 'legs')} left
        </p>
      </Show>
      <Show when={failedLegCount() > 0}>
        <div class="note error">
          Routing failed for {count(failedLegCount(), 'leg', 'legs')}
          {lastError() ? `: ${lastError()}` : '.'} <button onClick={retryFailedLegs}>Retry routing</button>
        </div>
      </Show>
      <Show when={exportable()}>
        <div class="row end">
          <button onClick={exportGpx}>Export GPX</button>
        </div>
      </Show>
    </section>
  );
}

function RouteRow(props: { route: Route }) {
  const route = props.route;
  const editing = () => editingRouteId() === route.id;
  const waypoints = createMemo(() => routeWaypoints(route.id).length);
  return (
    <li class="route" classList={{ active: editing() }}>
      <div class="row">
        <input
          type="color"
          class="swatch"
          aria-label={`Colour of ${route.name}`}
          title="Colour of the route"
          value={route.color}
          onInput={(e) => setRouteColor(route.id, e.currentTarget.value)}
          onChange={endGesture}
        />
        <EditableName value={route.name} label="route" onRename={(name) => renameRoute(route.id, name)} />
        <button
          class="icon"
          title={`Fly to ${route.name}`}
          aria-label={`Fly to ${route.name}`}
          disabled={route.points.length === 0 && waypoints() === 0}
          onClick={() => flyToRoute(route)}
        >
          <AreaIcon />
        </button>
        <button
          class="icon"
          title="Delete route"
          aria-label={`Delete ${route.name}`}
          onClick={async () => {
            const question = waypoints() > 0 ? `Delete the route "${route.name}" and its ${count(waypoints(), 'waypoint', 'waypoints')}?` : `Delete the route "${route.name}"?`;
            if (await askConfirmation(question, 'Delete')) removeRoute(route.id);
          }}
        >
          <CloseIcon />
        </button>
      </div>
      <div class="row">
        <span class="grow muted">
          {count(route.points.length, 'point', 'points')}
          {waypoints() > 0 && `, ${count(waypoints(), 'waypoint', 'waypoints')}`}
        </span>
        <select aria-label="Routing profile" value={route.profile} onChange={(e) => setRouteProfile(route.id, e.currentTarget.value as Profile)}>
          <For each={PROFILES}>{(p) => <option value={p.value}>{p.label}</option>}</For>
        </select>
        <button
          class="icon"
          title="Recalculate the route: route all its legs again"
          aria-label={`Recalculate ${route.name}`}
          disabled={routedLegs(route).length === 0}
          onClick={() => recalculate(route)}
        >
          <RefreshIcon />
        </button>
        <button onClick={() => (editing() ? stopDrawing() : startDrawing(route.id))}>{editing() ? 'Done' : 'Edit'}</button>
      </div>
      <div class="row" title="How wide the route's line is drawn">
        <span class="muted label">Line</span>
        <LineWidthSlider
          label={`Line width of ${route.name}`}
          value={lineWidth(route.lineWidth, ROUTE_LINE_WIDTH)}
          onInput={(width) => setRouteLineWidth(route.id, width)}
          onChange={endGesture}
        />
        <StylePopover id={`route-outline-${route.id}`} title="The line's outline" label={`Outline of ${route.name}`} icon={<PaletteIcon />}>
          <OutlineRows route={route} />
        </StylePopover>
      </div>
      <div class="row" title="How the route's line is coloured along its length">
        <span class="muted label">Colours</span>
        <select
          aria-label={`Line colouring of ${route.name}`}
          value={route.coloring ?? ''}
          onChange={(e) => {
            setRouteColoring(route.id, (e.currentTarget.value || undefined) as RouteColoring | undefined);
            retryColoring(route);
          }}
        >
          <option value="">Route colour</option>
          <For each={ROUTE_COLORINGS}>{(coloring) => <option value={coloring.id}>{coloring.name}</option>}</For>
        </select>
      </div>
      <Show when={route.coloring}>{(coloring) => <ColoringLegend route={route} coloring={coloring()} />}</Show>
      <Show when={waypoints() > 0}>
        <div class="row" title="How large the route's waypoints are drawn">
          <span class="muted label">Waypoints</span>
          <IconSizeSlider
            label={`Waypoint size of ${route.name}`}
            value={route.waypointSize}
            onInput={(size) => setWaypointSize(route.id, size)}
            onChange={endGesture}
          />
          <StylePopover id={`waypoint-look-${route.id}`} title="How the waypoints look" label={`Waypoint look of ${route.name}`} icon={<PaletteIcon />}>
            <WaypointLookRows route={route} />
          </StylePopover>
        </div>
      </Show>
    </li>
  );
}

/** The colour and width of the outline along the route's line. */
function OutlineRows(props: { route: Route }) {
  const route = props.route;
  const outline = () => routeOutline(route.outline);
  return (
    <>
      <div class="row" title="The colour and width of the outline along both sides of the line">
        <span class="muted label">Outline</span>
        <input
          type="color"
          class="swatch"
          aria-label={`Outline colour of ${route.name}`}
          value={outline().color}
          onInput={(e) => setRouteOutline(route.id, { color: e.currentTarget.value })}
          onChange={endGesture}
        />
        <OutlineWidthSlider
          label={`Outline width of ${route.name}`}
          value={outline().width}
          onInput={(width) => setRouteOutline(route.id, { width })}
          onChange={endGesture}
        />
      </div>
      <Show when={route.outline}>
        <button class="style-reset" onClick={() => resetRouteOutline(route.id)}>
          Back to a white outline
        </button>
      </Show>
    </>
  );
}

/** The panel's text and background colours (styles.css), which waypoint names follow where the route sets none. */
const PANEL_COLORS = { light: { text: '#212529', box: '#ffffff' }, dark: { text: '#e9ecef', box: '#212327' } };

/** The colour of the route's waypoint pins, and the colours and size of their names. */
function WaypointLookRows(props: { route: Route }) {
  const route = props.route;
  const look = () => waypointLook(route.waypointLook);
  return (
    <>
      <div class="row" title="The colour of the pins">
        <span class="muted label">Pin</span>
        <input
          type="color"
          class="swatch"
          aria-label={`Pin colour of ${route.name}`}
          value={look().pin}
          onInput={(e) => setWaypointLook(route.id, { pin: e.currentTarget.value })}
          onChange={endGesture}
        />
      </div>
      <div class="row" title="The colour and size of the names">
        <span class="muted label">Name</span>
        <input
          type="color"
          class="swatch"
          aria-label={`Name colour of ${route.name}`}
          value={look().text ?? PANEL_COLORS[theme()].text}
          onInput={(e) => setWaypointLook(route.id, { text: e.currentTarget.value })}
          onChange={endGesture}
        />
        <TextSizeSlider label={`Name size of ${route.name}`} value={look().size} onInput={(size) => setWaypointLook(route.id, { size })} onChange={endGesture} />
      </div>
      <div class="row" title="The colour of the box behind the names">
        <span class="muted label">Box</span>
        <input
          type="color"
          class="swatch"
          aria-label={`Name box colour of ${route.name}`}
          value={look().box ?? PANEL_COLORS[theme()].box}
          onInput={(e) => setWaypointLook(route.id, { box: e.currentTarget.value })}
          onChange={endGesture}
        />
      </div>
      <Show when={route.waypointLook}>
        <button class="style-reset" onClick={() => resetWaypointLook(route.id)}>
          Back to the default look
        </button>
      </Show>
    </>
  );
}
