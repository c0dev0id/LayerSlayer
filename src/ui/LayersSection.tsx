import { For, Show } from 'solid-js';
import { coversMostOfWorld } from '../geo/mercator';
import { TILE_MAX_AGE_HOURS } from '../map/tileCache';
import {
  canCache,
  isRaster,
  isVector,
  keepsTiles,
  layerColor,
  MAX_ZOOM,
  MIN_ZOOM,
  NO_ADJUSTMENTS,
  SOURCE_KINDS,
  type Layer,
  type RasterAdjustments,
} from '../model/layer';
import { OVERPASS_URL } from '../services/overpass';
import { hostOf } from '../state/net';
import { moveLayer, removeLayer, setActiveLayer, setBackground, setHostProxied, state, updateLayer } from '../state/store';
import { layerErrors, showBounds, zoom } from '../state/ui';
import { EditableName } from './EditableName';
import { AlertIcon, AreaIcon, CloseIcon, EyeIcon, EyeOffIcon, GripIcon } from './icons';
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
      <div class="row background" title="The colour the map is drawn on, under every layer">
        <span class="muted grow">Background</span>
        <input
          type="color"
          class="swatch"
          aria-label="Background colour of the map"
          value={state.settings.background ?? '#ffffff'}
          onInput={(e) => setBackground(e.currentTarget.value)}
        />
        <Show when={state.settings.background}>
          <button class="icon" title="Back to white" aria-label="Reset the background colour" onClick={() => setBackground(undefined)}>
            <CloseIcon />
          </button>
        </Show>
      </div>
      <Show when={active()} keyed>
        {(layer) => <ActiveLayer layer={layer} />}
      </Show>
    </section>
  );
}

/** Flies to the layer's bounds, no closer than the layer is drawn. */
function flyTo(layer: Layer): void {
  if (layer.bounds) showBounds(layer.bounds, Math.min(layer.maxzoom, 16));
}

function outOfRange(layer: Layer): boolean {
  return zoom() < layer.minzoom || zoom() >= layer.maxzoom;
}

/** Name (a click makes the layer active), visibility, flying to its area, error, delete and a drag handle. */
function LayerEntry(props: { layer: Layer; list: () => HTMLUListElement }) {
  const layer = props.layer;
  const isActive = () => state.activeLayerId === layer.id;
  let entry!: HTMLLIElement;

  return (
    <li ref={entry} class="layer" classList={{ active: isActive(), hidden: !layer.visible, 'out-of-range': outOfRange(layer) }}>
      <div class="layer-main">
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
        <EditableName value={layer.name} label="layer" onRename={(name) => updateLayer(layer.id, { name })}>
          <button
            class="layer-select grow"
            title={outOfRange(layer) ? `${layer.name} (not shown at this zoom)` : layer.name}
            aria-pressed={isActive()}
            onClick={() => setActiveLayer(layer.id)}
          >
            <span class="name">{layer.name}</span>
          </button>
        </EditableName>
        <Show when={layer.bounds && !coversMostOfWorld(layer.bounds)}>
          <button
            class="icon"
            title={`Fly to the area of ${layer.name}`}
            aria-label={`Fly to the area of ${layer.name}`}
            onClick={() => flyTo(layer)}
          >
            <AreaIcon />
          </button>
        </Show>
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
      </div>
      <LayerSummary layer={layer} />
    </li>
  );
}

/** The layer's settings at a glance: opacity, colour, zoom range and the options that are on. Edited below the list. */
function LayerSummary(props: { layer: Layer }) {
  const layer = props.layer;
  // From the settings rather than net.ts, so the tag follows the proxy checkbox.
  const proxied = () => {
    const host = layerHost(layer);
    return !!state.settings.proxy && host !== undefined && state.settings.proxiedHosts.includes(host);
  };
  return (
    <div class="layer-summary">
      <span>{Math.round(layer.opacity * 100)}%</span>
      <Show when={isVector(layer.source) && !layer.ownStyle}>
        <span class="layer-color" style={{ 'background-color': layerColor(layer) }} title={layerColor(layer)} />
      </Show>
      <Show when={layer.ownStyle}>
        <span title="Drawn with the service's own symbols">own symbols</span>
      </Show>
      <span title={`Drawn from zoom ${layer.minzoom} to ${layer.maxzoom}`}>
        z{layer.minzoom}–{layer.maxzoom}
      </span>
      <Show when={layer.adjust}>
        <span title="Its colours are adjusted">adjusted</span>
      </Show>
      <Show when={keepsTiles(layer)}>
        <span title={`Keeps its tiles in this browser for ${TILE_MAX_AGE_HOURS} hours`}>cache</span>
      </Show>
      <Show when={proxied()}>
        <span title="Fetched through the CORS proxy">proxy</span>
      </Show>
    </div>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** The sliders of a raster layer's colour adjustments, as MapLibre offers them. */
const ADJUSTMENTS: { key: keyof RasterAdjustments; label: string; title: string; min: number; max: number; step: number; show: (value: number) => string }[] = [
  { key: 'hue', label: 'Hue', title: 'Turns the colours around the colour wheel', min: 0, max: 360, step: 1, show: (v) => `${v}°` },
  { key: 'saturation', label: 'Saturation', title: 'Less colour down to grey, or more', min: -1, max: 1, step: 0.01, show: percent },
  { key: 'contrast', label: 'Contrast', title: 'Less or more contrast', min: -1, max: 1, step: 0.01, show: percent },
  { key: 'brightnessMin', label: 'Black', title: 'The brightness black becomes; above White the image is inverted', min: 0, max: 1, step: 0.01, show: percent },
  { key: 'brightnessMax', label: 'White', title: 'The brightness white becomes', min: 0, max: 1, step: 0.01, show: percent },
];

/** Hue, saturation, contrast and brightness range of a raster layer, folded away until wanted. */
function Adjustments(props: { layer: Layer }) {
  const layer = props.layer;
  const current = () => layer.adjust ?? NO_ADJUSTMENTS;
  // Open from the start where adjusted, read once so that Reset leaves it open.
  const startOpen = layer.adjust !== undefined;
  return (
    <details class="adjust" open={startOpen}>
      <summary class="muted">Colour adjustments</summary>
      {ADJUSTMENTS.map((a) => (
        <div class="row" title={a.title}>
          <span class="muted label">{a.label}</span>
          <input
            class="grow"
            type="range"
            aria-label={`${a.label} of ${layer.name}`}
            min={a.min}
            max={a.max}
            step={a.step}
            value={current()[a.key]}
            onInput={(e) => updateLayer(layer.id, { adjust: { ...current(), [a.key]: e.currentTarget.valueAsNumber } })}
          />
          <span class="value">{a.show(current()[a.key])}</span>
        </div>
      ))}
      <div class="row end">
        <button disabled={!layer.adjust} onClick={() => updateLayer(layer.id, { adjust: undefined })}>
          Reset
        </button>
      </div>
    </details>
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

/** The address a layer's data comes from, for showing and for the proxy setting. */
function sourceUrl(layer: Layer): string | undefined {
  const source = layer.source;
  switch (source.type) {
    case 'xyz':
    case 'vector-tiles':
      return source.tiles[0];
    case 'wmts':
      return source.template;
    case 'geojson':
    case 'image':
      return 'url' in source.data ? source.data.url : undefined;
    case 'osm-query':
      return OVERPASS_URL;
    default:
      return source.url;
  }
}

/** The server a layer's data comes from, for the proxy setting. */
function layerHost(layer: Layer): string | undefined {
  const url = sourceUrl(layer);
  return url ? hostOf(url) : undefined;
}

/** Opacity, zoom range, colour and source of the active layer. */
function ActiveLayer(props: { layer: Layer }) {
  const layer = props.layer;
  const host = () => layerHost(layer);
  const fileName = () => ('data' in layer.source && 'file' in layer.source.data ? layer.source.data.name : undefined);
  const zoomInput = (key: 'minzoom' | 'maxzoom', label: string) => (
    <input
      class="zoom-input"
      aria-label={label}
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
  );

  return (
    <div class="active-layer">
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
        {zoomInput('minzoom', `Lowest zoom ${layer.name} is shown at`)}
        <span class="muted">to</span>
        {zoomInput('maxzoom', `Zoom from which ${layer.name} is hidden`)}
        <span class="muted grow now" title="The map's zoom now">
          map {zoom().toFixed(1)}
        </span>
      </div>
      <Show when={isRaster(layer.source)}>
        <Adjustments layer={layer} />
      </Show>
      <Show when={layer.source.type === 'arcgis-features'}>
        <label class="row" title="The symbols the service draws this layer with, where Layer Slayer can draw them; otherwise its colour">
          <input type="checkbox" checked={!!layer.ownStyle} onChange={(e) => updateLayer(layer.id, { ownStyle: e.currentTarget.checked || undefined })} />
          <span>Draw with the service's own symbols</span>
        </label>
      </Show>
      <Show when={isVector(layer.source) && !layer.ownStyle}>
        <div class="row">
          <span class="muted label">Colour</span>
          <input
            type="color"
            class="swatch"
            aria-label={`Colour of ${layer.name}`}
            value={layerColor(layer)}
            onInput={(e) => updateLayer(layer.id, { color: e.currentTarget.value })}
          />
        </div>
      </Show>
      <div class="row">
        <span class="muted label">Source</span>
        <span class="grow name" title={sourceUrl(layer) ?? fileName()}>
          {SOURCE_KINDS[layer.source.type].label} · {host() ?? fileName() ?? ''}
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
      <Show when={canCache(layer.source)}>
        <label class="row" title="For slow servers: tiles once loaded are answered from the browser">
          <input type="checkbox" checked={keepsTiles(layer)} onChange={(e) => updateLayer(layer.id, { cache: e.currentTarget.checked })} />
          <span>Keep tiles in this browser for {TILE_MAX_AGE_HOURS} hours</span>
        </label>
      </Show>
      <Show when={layerErrors[layer.id]}>{(message) => <p class="note error">{message()}</p>}</Show>
    </div>
  );
}
