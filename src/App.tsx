import { createSignal } from 'solid-js';
import { MapView } from './map/MapView';
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
      </main>
      <AddLayerDialog open={adding()} onClose={() => setAdding(false)} />
    </div>
  );
}
