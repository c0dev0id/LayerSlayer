import { createSignal, Show } from 'solid-js';
import { ContextMenu } from './map/ContextMenu';
import { HintBar } from './map/HintBar';
import { Interactions } from './map/Interactions';
import { MapView } from './map/MapView';
import { RouteEditor } from './map/RouteEditor';
import { Toolbar } from './map/Toolbar';
import { Waypoints } from './map/Waypoints';
import { editingRouteId } from './state/drawing';
import { map } from './state/ui';
import { AddLayerDialog } from './ui/AddLayerDialog';
import { LayersSection } from './ui/LayersSection';
import { SettingsSection } from './ui/SettingsSection';

export function App() {
  const [adding, setAdding] = createSignal(false);
  return (
    <div class="app">
      <aside class="panel">
        <header class="section">
          <h1>webmap</h1>
        </header>
        <LayersSection onAdd={() => setAdding(true)} />
        <SettingsSection />
        <footer class="footer">
          Layers and settings are kept in this browser. <a href="https://github.com/c0dev0id/webmap">Source</a>
        </footer>
      </aside>
      <main class="map-wrap">
        <MapView />
        <Show when={map()}>
          {(m) => (
            <>
              <Waypoints map={m()} />
              <RouteEditor map={m()} />
              <Interactions map={m()} />
              <ContextMenu map={m()} />
            </>
          )}
        </Show>
        <Show when={editingRouteId()}>
          <HintBar />
          <Toolbar />
        </Show>
      </main>
      <AddLayerDialog open={adding()} onClose={() => setAdding(false)} />
    </div>
  );
}
