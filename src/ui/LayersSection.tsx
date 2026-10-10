import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { coversMostOfWorld } from '../geo/mercator';
import { layerFeatures } from '../map/layerFeatures';
import { TILE_MAX_AGE_HOURS } from '../map/tileCache';
import {
  canCache,
  fileResource,
  isRaster,
  isShown,
  isVector,
  keepsTiles,
  layerColor,
  LINE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  NO_ADJUSTMENTS,
  SOURCE_KINDS,
  type FileResource,
  type Layer,
  type LayerSource,
  type LineDash,
  type OsmQuery,
  type RasterAdjustments,
  type WmsTime,
} from '../model/layer';
import { lineWidth } from '../model/line';
import { propertyKeys } from '../services/featureProperties';
import { importAccept } from '../services/importFile';
import { loadFile } from '../state/files';
import { isUpdating, updateOsmQueryLayer } from '../state/osmQuery';
import { timeValues } from '../services/wmsTime';
import { layerHost, moveLayer, proxiesHost, removeLayer, replaceLayerFile, setActiveLayer, setBackground, setHostProxied, setLayerTime, sourceUrl, state, updateLayer } from '../state/store';
import { layerErrors, map, onlyLayerId, showLayerArea, zoom } from '../state/ui';
import { EditableName } from './EditableName';
import { IconPickButton } from './IconPicker';
import { IconSizeSlider } from './IconSizeSlider';
import { LineWidthSlider } from './LineWidthSlider';
import { downloadBlob, fileNameFor } from './download';
import { createOutcome, OutcomeNote } from './outcome';
import { LayerInfo } from './LayerInfo';
import { AlertIcon, AreaIcon, CloseIcon, DownloadIcon, DownloadLink, EyeIcon, EyeOffIcon, GripIcon, IconBadge, InfoIcon } from './icons';
import { reorderTarget } from './reorder';

export function LayersSection(props: { onAdd: () => void }) {
  // Top layer first, like an image editor's layer list.
  const topFirst = () => [...state.layers].reverse();
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
    </section>
  );
}

function outOfRange(layer: Layer): boolean {
  return zoom() < layer.minzoom || zoom() >= layer.maxzoom;
}

/**
 * Name (a click opens the layer's settings under it, or closes them), visibility, flying to
 * its area, error, delete and a drag handle; its summary line while its settings are closed.
 */
function LayerEntry(props: { layer: Layer; list: () => HTMLUListElement }) {
  const layer = props.layer;
  const isActive = () => state.activeLayerId === layer.id;
  let entry!: HTMLLIElement;

  return (
    <li
      ref={entry}
      class="layer"
      classList={{ active: isActive(), hidden: !isShown(layer, state.layers.indexOf(layer), onlyLayerId()), 'out-of-range': outOfRange(layer) }}
    >
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
            aria-expanded={isActive()}
            onClick={() => setActiveLayer(isActive() ? undefined : layer.id)}
          >
            <span class="name">{layer.name}</span>
          </button>
        </EditableName>
        <Show when={layer.bounds && !coversMostOfWorld(layer.bounds)}>
          <button
            class="icon"
            title={`Fly to the area of ${layer.name}`}
            aria-label={`Fly to the area of ${layer.name}`}
            onClick={() => showLayerArea(layer)}
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
      <Show when={isActive()} fallback={<LayerSummary layer={layer} />}>
        <ActiveLayer layer={layer} />
      </Show>
    </li>
  );
}

/** The layer's settings at a glance: opacity, colour, zoom range and the options that are on. Edited where they open, in its place. */
function LayerSummary(props: { layer: Layer }) {
  const layer = props.layer;
  // From the settings rather than net.ts, so the tag follows the proxy checkbox.
  const proxied = () => proxiesHost(layerHost(layer));
  return (
    <div class="layer-summary">
      <span>{Math.round(layer.opacity * 100)}%</span>
      <Show when={isVector(layer.source) && !layer.ownStyle}>
        <Show when={layer.icon} fallback={<span class="layer-color" style={{ 'background-color': layerColor(layer) }} title={layerColor(layer)} />}>
          {(icon) => <IconBadge icon={icon()} color={layerColor(layer)} />}
        </Show>
      </Show>
      <Show when={layer.ownStyle}>
        <span title="Drawn with the service's own symbols">own symbols</span>
      </Show>
      <Show when={timeOf(layer.source)}>{(time) => <span title="The time it is drawn at">{time().value}</span>}</Show>
      <span title={`Drawn from zoom ${layer.minzoom} to ${layer.maxzoom}`}>
        z{layer.minzoom}–{layer.maxzoom}
      </span>
      <Show when={layer.adjust}>
        <span title="Its colours are adjusted">adjusted</span>
      </Show>
      <Show when={layer.label}>{(label) => <span title={`Labelled with ${label()}`}>label</span>}</Show>
      <Show when={keepsTiles(layer) && !state.settings.tileCacheOff}>
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
  // The entry alone follows the pointer, without its open settings.
  ghost.querySelector('.active-layer')?.remove();
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

/** Saves the features a layer keeps in the browser as a GeoJSON file, to archive, add again later or open elsewhere. */
async function saveGeoJson(layer: Layer, file: FileResource): Promise<void> {
  downloadBlob(await loadFile(file.file), fileNameFor(layer.name, 'geojson'));
}

/** What an OSM query layer asked for and when; Update asks again, in the focus area as it is now. */
function OsmQueryRows(props: { id: string; query: OsmQuery }) {
  const updated = createOutcome();
  const update = () =>
    updated.run(async () => {
      const count = await updateOsmQueryLayer(props.id);
      return `Updated: ${count} ${count === 1 ? 'feature' : 'features'}.`;
    });

  return (
    <>
      <div class="row">
        <span class="muted label">Tags</span>
        <span class="grow name" title={props.query.filters.join('\n')}>
          {props.query.filters.join(', ')}
        </span>
      </div>
      <div class="row">
        <span class="muted label">Queried</span>
        <span class="grow">{new Date(props.query.queried).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <button
          disabled={isUpdating(props.id) || !state.focus}
          title={state.focus ? 'Query the focus area again, as it is now' : 'Draw a focus area first'}
          onClick={() => void update()}
        >
          {isUpdating(props.id) ? 'Updating…' : 'Update'}
        </button>
      </div>
      <OutcomeNote outcome={updated.outcome()} />
    </>
  );
}

/**
 * When the file of a layer was changed, the link to where it is published, and choosing a
 * newer version in its place; the layer keeps its settings.
 */
function FileRows(props: { layer: Layer; file: FileResource }) {
  const replaced = createOutcome();
  const replace = (file: File) =>
    replaced.run(async () => {
      await replaceLayerFile(props.layer.id, file);
      return `Replaced with ${file.name}.`;
    });

  return (
    <>
      <div class="row">
        <span class="muted label">File</span>
        <span class="grow" title="When the file was last changed, as far as the browser said">
          {props.file.modified && new Date(props.file.modified).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </span>
        <Show when={props.layer.origin}>{(url) => <DownloadLink href={url()} of={props.layer.name} />}</Show>
        <label class="button" classList={{ disabled: replaced.running() }} title="Choose a newer version of the file; the layer keeps its settings">
          {replaced.running() ? 'Reading…' : 'Replace…'}
          <input
            type="file"
            hidden
            accept={importAccept(props.layer.source.type === 'image' ? 'image' : 'geojson')}
            aria-label={`Replace the file of ${props.layer.name}`}
            disabled={replaced.running()}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) void replace(file);
            }}
          />
        </label>
      </div>
      <OutcomeNote outcome={replaced.outcome()} />
    </>
  );
}

/**
 * The property a vector layer writes beside its features, chosen among those its features
 * have: read when the settings open, once the map has loaded, and when the list is opened,
 * as tiles loaded since may bring more.
 */
function LabelRow(props: { layer: Layer }) {
  const layer = props.layer;
  const [keys, setKeys] = createSignal<string[]>([]);
  const read = () => {
    const m = map();
    if (m) layerFeatures(m, layer).then((features) => setKeys(propertyKeys(features)), () => {});
  };
  onMount(() => {
    read();
    map()?.once('idle', read);
  });
  onCleanup(() => map()?.off('idle', read));
  const options = () => (layer.label && !keys().includes(layer.label) ? [layer.label, ...keys()] : keys());

  return (
    <div class="row" title="Writes a property of each feature beside it on the map">
      <span class="muted label">Label</span>
      <select aria-label={`Label of ${layer.name}`} onFocus={read} onChange={(e) => updateLayer(layer.id, { label: e.currentTarget.value || undefined })}>
        <option value="" selected={!layer.label}>
          None
        </option>
        <For each={options()}>
          {(key) => (
            <option value={key} selected={key === layer.label}>
              {key}
            </option>
          )}
        </For>
      </select>
    </div>
  );
}

/** The time dimension of a WMS layer that has maps of several times. */
const timeOf = (source: LayerSource) => (source.type === 'wms' ? source.time : undefined);

/**
 * The time a layer with maps of several times is drawn at: chosen from the times the
 * service lists, or typed where they are too many to list.
 */
function TimeRow(props: { layer: Layer; time: WmsTime }) {
  const options = () => {
    const values = timeValues(props.time.extent);
    return values && !values.includes(props.time.value) ? [props.time.value, ...values] : values;
  };
  return (
    <div class="row" title={`The times the service has: ${props.time.extent}`}>
      <span class="muted label">Time</span>
      <Show
        when={options()}
        fallback={
          <input
            class="grow"
            type="text"
            aria-label={`Time of ${props.layer.name}`}
            value={props.time.value}
            onChange={(e) => {
              const value = e.currentTarget.value.trim();
              if (value) setLayerTime(props.layer.id, value);
              else e.currentTarget.value = props.time.value;
            }}
          />
        }
      >
        {(values) => (
          <select aria-label={`Time of ${props.layer.name}`} onChange={(e) => setLayerTime(props.layer.id, e.currentTarget.value)}>
            <For each={values()}>
              {(value) => (
                <option value={value} selected={value === props.time.value}>
                  {value}
                </option>
              )}
            </For>
          </select>
        )}
      </Show>
    </div>
  );
}

/** Why a layer's proxy checkbox is as it is, where Settings decides it. */
function proxyNote(): string | undefined {
  if (!state.settings.proxy) return 'Set a CORS proxy in Settings first';
  if (state.settings.proxyMode === 'off') return 'The CORS proxy is switched off in Settings';
  if (state.settings.proxyMode === 'all') return 'Every layer goes through the CORS proxy (Settings)';
  return undefined;
}

/** Opacity, zoom range, colour and source of the active layer. */
function ActiveLayer(props: { layer: Layer }) {
  const layer = props.layer;
  const host = () => layerHost(layer);
  const fileName = () => fileResource(layer.source)?.name;
  const [info, setInfo] = createSignal(false);
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
      <Show when={timeOf(layer.source)}>{(time) => <TimeRow layer={layer} time={time()} />}</Show>
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
        <div class="row" title="How lines and the outlines of areas are drawn">
          <span class="muted label">Line</span>
          <select
            aria-label={`Line style of ${layer.name}`}
            value={layer.lineDash ?? ''}
            onChange={(e) => updateLayer(layer.id, { lineDash: (e.currentTarget.value || undefined) as LineDash | undefined })}
          >
            <option value="">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="long-dashed">Long dashes</option>
            <option value="dotted">Dotted</option>
          </select>
          <LineWidthSlider
            label={`Line width of ${layer.name}`}
            value={lineWidth(layer.lineWidth, LINE_WIDTH)}
            onInput={(lineWidth) => updateLayer(layer.id, { lineWidth })}
          />
        </div>
        <div class="row" title="Marks points and areas with an icon on a disc of the layer's colour">
          <span class="muted label">Icon</span>
          <IconPickButton icon={layer.icon} color={layerColor(layer)} of={layer.name} onChange={(icon) => updateLayer(layer.id, { icon })} />
        </div>
        <Show when={layer.icon}>
          <div class="row" title="How large the icon is drawn">
            <span class="muted label">Size</span>
            <IconSizeSlider label={`Icon size of ${layer.name}`} value={layer.iconSize} onInput={(iconSize) => updateLayer(layer.id, { iconSize })} />
          </div>
        </Show>
        <LabelRow layer={layer} />
      </Show>
      {/* An OSM query's file is updated by running the query again, other files replaced. */}
      <Switch>
        <Match when={layer.source.type === 'geojson' && layer.source.query}>{(query) => <OsmQueryRows id={layer.id} query={query()} />}</Match>
        <Match when={fileResource(layer.source)}>{(file) => <FileRows layer={layer} file={file()} />}</Match>
      </Switch>
      <div class="row">
        <span class="muted label">Source</span>
        <span class="grow name" title={sourceUrl(layer) ?? fileName()}>
          {SOURCE_KINDS[layer.source.type].label} · {host() ?? fileName() ?? ''}
        </span>
        <Show when={layer.source.type === 'geojson' && fileResource(layer.source)}>
          {(file) => (
            <button
              class="icon"
              title="Save the features as a GeoJSON file, to keep, add again later or open in another application"
              aria-label={`Save ${layer.name} as GeoJSON`}
              onClick={() => void saveGeoJson(layer, file())}
            >
              <DownloadIcon />
            </button>
          )}
        </Show>
        <button class="icon" title="Technical details" aria-label={`Technical details of ${layer.name}`} aria-expanded={info()} onClick={() => setInfo(!info())}>
          <InfoIcon />
        </button>
      </div>
      <Show when={info()}>
        <LayerInfo layer={layer} />
      </Show>
      <Show when={host()}>
        {(h) => (
          <label class="row" title={proxyNote()}>
            <input
              type="checkbox"
              disabled={!state.settings.proxy || state.settings.proxyMode === 'all'}
              checked={state.settings.proxyMode === 'all' ? !!state.settings.proxy : state.settings.proxiedHosts.includes(h())}
              onChange={(e) => setHostProxied(h(), e.currentTarget.checked)}
            />
            <span>Fetch {h()} through the CORS proxy</span>
          </label>
        )}
      </Show>
      <Show when={canCache(layer.source)}>
        <label
          class="row"
          title={state.settings.tileCacheOff ? 'Tile caching is switched off in Settings' : 'For slow servers: tiles once loaded are answered from the browser'}
        >
          <input
            type="checkbox"
            disabled={state.settings.tileCacheOff}
            checked={keepsTiles(layer)}
            onChange={(e) => updateLayer(layer.id, { cache: e.currentTarget.checked })}
          />
          <span>Keep tiles in this browser for {TILE_MAX_AGE_HOURS} hours</span>
        </label>
      </Show>
      <Show when={layerErrors[layer.id]}>{(message) => <p class="note error">{message()}</p>}</Show>
    </div>
  );
}
