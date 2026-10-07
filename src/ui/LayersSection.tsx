import { For, Show } from 'solid-js';
import { isVector, MAX_ZOOM, MIN_ZOOM, type Layer } from '../model/layer';
import { hostOf } from '../state/net';
import {
  moveLayer,
  removeLayer,
  setActiveLayer,
  setHostProxied,
  state,
  updateLayer,
} from '../state/store';
import { layerErrors, map, zoom } from '../state/ui';
import { AlertIcon, CloseIcon, EyeIcon, EyeOffIcon, GripIcon } from './icons';
import { reorderTarget } from './reorder';

export function LayersSection(props: { onAdd: () => void }) {
  // Top layer first, like an image editor's layer list.
  const topFirst = () => [...state.layers].reverse();
  const active = () => state.layers.find((l) => l.id === state.activeLayerId);
  let list!: HTMLUListElement;

  return (
    <section class="section">
      <div class="row">
        <h2 class="grow">Layers</h2>
        <button class="primary" onClick={() => props.onAdd()}>
          Add layer
        </button>
      </div>
      <Show when={state.layers.length === 0}>
        <p class="muted hint">No layers yet. Add a base map from the library, or a service by its address.</p>
      </Show>
      <ul class="layers" ref={list}>
        <For each={topFirst()}>{(layer) => <LayerEntry layer={layer} list={() => list} />}</For>
      </ul>
      <Show when={active()} keyed>
        {(layer) => <ActiveLayer layer={layer} />}
      </Show>
    </section>
  );
}

function outOfRange(layer: Layer): boolean {
  return zoom() < layer.minzoom || zoom() >= layer.maxzoom;
}

/** Name (a click makes the layer active), visibility, error, delete and a drag handle. */
function LayerEntry(props: { layer: Layer; list: () => HTMLUListElement }) {
  const layer = props.layer;
  const isActive = () => state.activeLayerId === layer.id;
  let entry!: HTMLLIElement;

  return (
    <li ref={entry} class="layer" classList={{ active: isActive(), hidden: !layer.visible, 'out-of-range': outOfRange(layer) }}>
      <button
        class="icon grip"
        title="Drag to reorder (or use the arrow keys)"
        aria-label={`Reorder ${layer.name}`}
        onPointerDown={(e) => dragToReorder(e, layer, entry, props.list())}
        onKeyDown={(e) => {
          // Up in the list is up in the stack (a higher index).
          const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          moveLayer(layer.id, state.layers.indexOf(layer) + step);
        }}
      >
        <GripIcon />
      </button>
      <button
        class="icon"
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
        onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
      >
        {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
      </button>
      <button
        class="layer-select grow"
        title={outOfRange(layer) ? `${layer.name} (not shown at this zoom)` : layer.name}
        aria-pressed={isActive()}
        onClick={() => setActiveLayer(layer.id)}
      >
        <span class="name">{layer.name}</span>
      </button>
      <Show when={layerErrors[layer.id]}>
        {(message) => (
          <span class="error-mark" title={message()} role="img" aria-label={message()}>
            <AlertIcon />
          </span>
        )}
      </Show>
      <button class="icon" title="Remove layer" aria-label={`Remove ${layer.name}`} onClick={() => removeLayer(layer.id)}>
        <CloseIcon />
      </button>
    </li>
  );
}

/**
 * Drags a layer entry by its handle: a copy follows the pointer, a line shows where it
 * lands, and dropping moves the layer. Works with mouse, touch and pen.
 */
function dragToReorder(e: PointerEvent, layer: Layer, entry: HTMLLIElement, list: HTMLUListElement) {
  if (!e.isPrimary || e.button !== 0) return;
  const handle = e.currentTarget as HTMLElement;
  handle.setPointerCapture(e.pointerId);
  const entries = [...list.children] as HTMLElement[];
  const from = entries.indexOf(entry);
  const mids = entries.map((el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  const rect = entry.getBoundingClientRect();
  const ghost = entry.cloneNode(true) as HTMLElement;
  ghost.classList.add('layer-ghost');
  Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
  // Inside the panel, so the copy keeps the panel's button styles; fixed to the viewport.
  (entry.closest('.panel') ?? document.body).append(ghost);
  entry.classList.add('dragging');

  let to = from;
  const showDrop = () => {
    for (const other of entries) other.classList.remove('drop-before', 'drop-after');
    if (to !== from) entries[to]!.classList.add(to < from ? 'drop-before' : 'drop-after');
  };
  const move = (ev: PointerEvent) => {
    ghost.style.top = `${rect.top + ev.clientY - e.clientY}px`;
    to = reorderTarget(mids, from, ev.clientY);
    showDrop();
  };
  const end = (ev: PointerEvent) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    ghost.remove();
    entry.classList.remove('dragging');
    const target = to;
    to = from;
    showDrop();
    // The list shows the top layer first: list position 0 is the top of the stack.
    if (ev.type === 'pointerup' && target !== from) moveLayer(layer.id, entries.length - 1 - target);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

const SOURCE_LABELS: Record<Layer['source']['type'], string> = {
  xyz: 'XYZ tiles',
  wms: 'WMS',
  wmts: 'WMTS',
  'arcgis-map': 'ArcGIS MapServer',
  'arcgis-features': 'ArcGIS features',
  geojson: 'GeoJSON',
  style: 'MapLibre style',
  image: 'Georeferenced image',
};

/** The address a layer's data comes from, for showing and for the proxy setting. */
function sourceUrl(layer: Layer): string | undefined {
  const source = layer.source;
  switch (source.type) {
    case 'xyz':
      return source.tiles[0];
    case 'wmts':
      return source.template;
    case 'geojson':
    case 'image':
      return 'url' in source.data ? source.data.url : undefined;
    default:
      return source.url;
  }
}

/** Opacity, zoom range, colour and source of the active layer. */
function ActiveLayer(props: { layer: Layer }) {
  const layer = props.layer;
  const host = () => {
    const url = sourceUrl(layer);
    return url ? hostOf(url) : undefined;
  };
  const fileName = () => ('data' in layer.source && 'file' in layer.source.data ? layer.source.data.name : undefined);
  const zoomInput = (key: 'minzoom' | 'maxzoom', label: string) => (
    <label class="zoom-input">
      <span class="muted">{label}</span>
      <input
        type="number"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step="0.5"
        value={layer[key]}
        onChange={(e) => {
          const value = e.currentTarget.valueAsNumber;
          if (Number.isFinite(value)) updateLayer(layer.id, { [key]: value });
          else e.currentTarget.value = String(layer[key]);
        }}
      />
    </label>
  );

  return (
    <div class="active-layer">
      <div class="row">
        <input
          class="grow name-input"
          aria-label="Layer name"
          value={layer.name}
          onChange={(e) => updateLayer(layer.id, { name: e.currentTarget.value.trim() || layer.name })}
        />
      </div>
      <div class="row">
        <span class="muted label">Opacity</span>
        <input
          class="grow"
          type="range"
          aria-label={`Opacity of ${layer.name}`}
          min="0"
          max="1"
          step="0.01"
          value={layer.opacity}
          onInput={(e) => updateLayer(layer.id, { opacity: e.currentTarget.valueAsNumber })}
        />
        <span class="value">{Math.round(layer.opacity * 100)}%</span>
      </div>
      <div class="row">
        <span class="muted label">Zoom</span>
        {zoomInput('minzoom', 'from')}
        {zoomInput('maxzoom', 'to')}
        <span class="muted grow" title="The map's zoom now">
          now {zoom().toFixed(1)}
        </span>
      </div>
      <Show when={isVector(layer.source)}>
        <div class="row">
          <span class="muted label">Colour</span>
          <input
            type="color"
            class="swatch"
            aria-label={`Colour of ${layer.name}`}
            value={layer.color ?? '#e8590c'}
            onInput={(e) => updateLayer(layer.id, { color: e.currentTarget.value })}
          />
        </div>
      </Show>
      <div class="row">
        <span class="muted label">Source</span>
        <span class="grow name" title={sourceUrl(layer) ?? fileName()}>
          {SOURCE_LABELS[layer.source.type]} · {host() ?? fileName() ?? ''}
        </span>
      </div>
      <Show when={host()}>
        {(h) => (
          <label class="row" title={state.settings.proxy ? undefined : 'Set a CORS proxy in Settings first'}>
            <input
              type="checkbox"
              disabled={!state.settings.proxy}
              checked={state.settings.proxiedHosts.includes(h())}
              onChange={(e) => setHostProxied(h(), e.currentTarget.checked)}
            />
            <span>Fetch {h()} through the CORS proxy</span>
          </label>
        )}
      </Show>
      <Show when={layer.bounds}>
        {(bounds) => (
          <div class="row">
            <button onClick={() => map()?.fitBounds(bounds(), { padding: 40, maxZoom: Math.min(layer.maxzoom, 18) })}>
              Zoom to layer
            </button>
          </div>
        )}
      </Show>
      <Show when={layerErrors[layer.id]}>{(message) => <p class="note error">{message()}</p>}</Show>
    </div>
  );
}
