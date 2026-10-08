import { createSignal, For, Show } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { geojsonBounds } from '../geo/bounds';
import { PROFILES, type LngLat, type Profile, type Route } from '../model/route';
import { gpxToRouteData, routeTracks } from '../routing/gpx';
import { routePoints } from '../routing/legs';
import { nextRouteColor } from '../routing/routeEdit';
import { failedLegCount, lastError, pendingLegs, retryFailedLegs } from '../routing/service';
import { editingRouteId, startDrawing, stopDrawing } from '../state/drawing';
import { addRoute, importRouteData, removeRoute, renameRoute, routeData, setRouteProfile } from '../state/routes';
import { parseGpx, toGpx } from '../services/gpx';
import { fileName } from '../services/read';
import { errorMessage, showBounds } from '../state/ui';
import { askConfirmation } from './confirm';
import { downloadBlob } from './download';
import { EditableName } from './EditableName';
import { AreaIcon, CloseIcon } from './icons';

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
  const message = `${unrouted} ${unrouted === 1 ? 'leg is' : 'legs are'} not routed and will be exported as straight lines.`;
  if (unrouted > 0 && !(await askConfirmation(message, 'Export anyway'))) return;
  const tracks = routeTracks(unwrap(routeData.routes));
  const gpx = toGpx('Routes', unwrap(routeData.waypoints), tracks, new Date());
  downloadBlob(new Blob([gpx], { type: 'application/gpx+xml' }), 'routes.gpx');
}

/** Moves the view to show the whole route, detours of routed legs included. */
function flyToRoute(route: Route) {
  const plain = unwrap(route);
  showPoints([...plain.points.map((p) => p.lngLat), ...routePoints(plain)]);
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
          Routing… {pendingLegs()} {pendingLegs() === 1 ? 'leg' : 'legs'} left
        </p>
      </Show>
      <Show when={failedLegCount() > 0}>
        <div class="note error">
          Routing failed for {failedLegCount()} {failedLegCount() === 1 ? 'leg' : 'legs'}
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
  return (
    <li class="route" classList={{ active: editing() }}>
      <div class="row">
        <span class="route-swatch" style={{ 'background-color': route.color }} />
        <EditableName value={route.name} label="route" onRename={(name) => renameRoute(route.id, name)} />
        <button
          class="icon"
          title={`Fly to ${route.name}`}
          aria-label={`Fly to ${route.name}`}
          disabled={route.points.length === 0}
          onClick={() => flyToRoute(route)}
        >
          <AreaIcon />
        </button>
        <button
          class="icon"
          title="Delete route"
          aria-label={`Delete ${route.name}`}
          onClick={async () => {
            if (await askConfirmation(`Delete the route "${route.name}"?`, 'Delete')) removeRoute(route.id);
          }}
        >
          <CloseIcon />
        </button>
      </div>
      <div class="row">
        <span class="grow muted">
          {route.points.length} {route.points.length === 1 ? 'point' : 'points'}
        </span>
        <select aria-label="Routing profile" value={route.profile} onChange={(e) => setRouteProfile(route.id, e.currentTarget.value as Profile)}>
          <For each={PROFILES}>{(p) => <option value={p.value}>{p.label}</option>}</For>
        </select>
        <button onClick={() => (editing() ? stopDrawing() : startDrawing(route.id))}>{editing() ? 'Done' : 'Edit'}</button>
      </div>
    </li>
  );
}
