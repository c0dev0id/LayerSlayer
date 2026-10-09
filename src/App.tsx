import { createSignal, Show } from 'solid-js';
import { ContextMenu } from './map/ContextMenu';
import { HintBar } from './map/HintBar';
import { Interactions } from './map/Interactions';
import { MapView } from './map/MapView';
import { RouteEditor } from './map/RouteEditor';
import { SearchBox } from './map/SearchBox';
import { Toolbar } from './map/Toolbar';
import { Waypoints } from './map/Waypoints';
import { editingRouteId } from './state/drawing';
import { map, panelCollapsed } from './state/ui';
import { AddLayerDialog } from './ui/AddLayerDialog';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DetailsDialog } from './ui/DetailsDialog';
import { IconPicker } from './ui/IconPicker';
import { PanelResizer, panelWidth } from './ui/PanelResizer';
import { FocusSection } from './ui/FocusSection';
import { LayersSection } from './ui/LayersSection';
import { ProjectSection } from './ui/ProjectSection';
import { RoutesSection } from './ui/RoutesSection';
import { SettingsSection } from './ui/SettingsSection';
import { WaypointDialog } from './ui/WaypointDialog';

export function App() {
  const [adding, setAdding] = createSignal(false);
  return (
    <div class="app" classList={{ 'panel-collapsed': panelCollapsed() }} style={{ '--panel-width': `${panelWidth()}px` }}>
      <aside class="panel">
        <ProjectSection />
        <FocusSection />
        <LayersSection onAdd={() => setAdding(true)} />
        <RoutesSection />
        <SettingsSection />
        <footer class="footer">
          Layers, routes and settings are kept in this browser; Save takes them to another. <a href="https://github.com/c0dev0id/LayerSlayer">Source</a>
        </footer>
      </aside>
      <PanelResizer />
      <main class="map-wrap">
        <MapView />
        <Show when={map()}>
          {(m) => (
            <>
              <Waypoints map={m()} />
              <RouteEditor map={m()} />
              <Interactions map={m()} />
              <ContextMenu map={m()} />
              <SearchBox map={m()} />
            </>
          )}
        </Show>
        <HintBar />
        <Show when={editingRouteId()}>
          <Toolbar />
        </Show>
      </main>
      <AddLayerDialog open={adding()} onClose={() => setAdding(false)} />
      <WaypointDialog />
      <ConfirmDialog />
      <IconPicker />
      <DetailsDialog />
    </div>
  );
}
