import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { MAX_ZOOM, MIN_ZOOM } from '../model/layer';
import {
  chosenLayers,
  estimatedBytes,
  PAUSE_MS,
  planPrecache,
  sampled,
  sampleTiles,
  SLOW_PAUSE_MS,
  startPrecache,
  type LayerChoice,
  type PlannedLayer,
  type PrecacheJob,
} from '../state/precache';
import { state } from '../state/store';
import { zoom } from '../state/ui';
import { countText, durationText, sizeText } from './format';
import { showModalWhile } from './modal';

const [opened, setOpened] = createSignal(false);

/** Opens the dialog that sets up precaching the focus area. */
export function openPrecacheDialog(): void {
  setOpened(true);
}

/** What to do with a layer whose server asks for restraint: leave it out, or fetch it slowly. */
type Restraint = 'exclude' | 'slow';

/**
 * Precaching the focus area: which layers and zooms, with the tiles of each zoom counted at
 * once and their size estimated from sampled tiles as they come in, the free space beside
 * it, and the servers that forbid or discourage bulk downloads named. Start closes the
 * dialog and fetches the tiles; the focus area section shows how it goes.
 */
export function PrecacheDialog() {
  let dialog!: HTMLDialogElement;
  showModalWhile(() => dialog, opened);
  return (
    <dialog ref={dialog} class="dialog precache-dialog" aria-label="Precache the focus area" onClose={() => setOpened(false)}>
      <Show when={opened() && state.focus}>{(area) => <PrecacheForm area={area()} />}</Show>
    </dialog>
  );
}

function PrecacheForm(props: { area: [number, number][] }) {
  const now = Math.max(MIN_ZOOM, Math.floor(zoom()));
  const [choice, setChoice] = createSignal<LayerChoice>(state.activeLayerId ? 'open' : 'visible');
  const [from, setFrom] = createSignal(now);
  const [to, setTo] = createSignal(Math.min(MAX_ZOOM, now + 2));
  const [restraint, setRestraint] = createStore<Record<string, Restraint>>({});
  // Bumped as samples come in, so that the estimates are read again.
  const [samples, setSamples] = createSignal(0);

  const plan = createMemo(() => planPrecache(chosenLayers(choice(), state.layers, state.activeLayerId), props.area, from(), to()));
  /** The pause after each tile of a layer, or undefined where it is left out. */
  const pauseOf = (planned: PlannedLayer): number | undefined => {
    if (!planned.source || planned.policy?.level === 'forbidden') return undefined;
    if (planned.policy?.level === 'warn') return restraint[planned.layer.id] === 'slow' ? SLOW_PAUSE_MS : undefined;
    return PAUSE_MS;
  };
  const included = createMemo(() => plan().filter((p) => pauseOf(p) !== undefined));

  createEffect(
    on([plan, () => ({ ...restraint })], () => {
      const controller = new AbortController();
      void sampleTiles(plan(), props.area, pauseOf, () => setSamples((n) => n + 1), controller.signal).catch(() => {});
      onCleanup(() => controller.abort());
    }),
  );

  /** Per map zoom across the included layers: tiles, estimated bytes, and whether every size is known. */
  const rows = createMemo(() => {
    samples();
    const byZoom = new Map<number, { tiles: number; bytes: number; known: boolean }>();
    for (const planned of included()) {
      for (const { mapZoom, z, count } of planned.zooms) {
        const row = byZoom.get(mapZoom) ?? { tiles: 0, bytes: 0, known: true };
        const bytes = count === 0 ? 0 : estimatedBytes(planned.source!, z, count);
        byZoom.set(mapZoom, { tiles: row.tiles + count, bytes: row.bytes + (bytes ?? 0), known: row.known && bytes !== undefined });
      }
    }
    return [...byZoom].sort(([a], [b]) => a - b).map(([mapZoom, row]) => ({ mapZoom, ...row }));
  });
  const total = createMemo(() => rows().reduce((sum, row) => ({ tiles: sum.tiles + row.tiles, bytes: sum.bytes + row.bytes, known: sum.known && row.known }), { tiles: 0, bytes: 0, known: true }));
  const sampling = createMemo(() => {
    samples();
    const wanted = included().flatMap((p) => p.zooms.filter((z) => Number.isFinite(z.count) && z.count > 0).map((z) => sampled(p.source!, z.z)));
    return { done: wanted.filter(Boolean).length, of: wanted.length };
  });
  const atLeast = createMemo(() => included().reduce((sum, p) => sum + p.zooms.reduce((s, z) => s + z.count, 0) * pauseOf(p)!, 0) / 1000);
  const [space] = createResource(async () => {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.quota !== undefined ? estimate.quota - (estimate.usage ?? 0) : undefined;
  });
  const tooMany = () => !Number.isFinite(total().tiles);
  const tooBig = () => space() !== undefined && total().bytes > space()!;

  const start = () => {
    const jobs: PrecacheJob[] = included().flatMap((planned) =>
      planned.zooms.filter((z) => z.count > 0).map(({ z, count }) => ({ source: planned.source!, z, count, pause: pauseOf(planned)! })),
    );
    void startPrecache(jobs, props.area);
    setOpened(false);
  };

  const zoomInput = (value: () => number, set: (z: number) => void, label: string) => (
    <input
      class="zoom-input"
      type="number"
      aria-label={label}
      min={MIN_ZOOM}
      max={MAX_ZOOM}
      step="1"
      value={value()}
      onChange={(e) => {
        const z = Math.round(e.currentTarget.valueAsNumber);
        if (Number.isFinite(z)) set(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)));
        e.currentTarget.value = String(value());
      }}
    />
  );

  return (
    <div class="precache">
      <h2>Precache the focus area</h2>
      <p class="muted hint">The tiles are kept until the tile cache is cleared, so that the map draws them at once later.</p>
      <div class="row">
        <span class="label">Layers</span>
        <div class="segmented" role="radiogroup" aria-label="Layers to precache">
          <For each={[['open', 'Open layer'], ['visible', 'Visible'], ['all', 'All']] as const}>
            {([value, label]) => (
              <label title={value === 'open' && !state.activeLayerId ? 'Open a layer’s settings to choose it' : undefined}>
                <input type="radio" name="precache-layers" disabled={value === 'open' && !state.activeLayerId} checked={choice() === value} onChange={() => setChoice(value)} />
                <span>{label}</span>
              </label>
            )}
          </For>
        </div>
      </div>
      <div class="row">
        <span class="label">Zoom</span>
        {zoomInput(from, (z) => (setFrom(z), z > to() && setTo(z)), 'Precache from zoom')}
        <span class="muted">to</span>
        {zoomInput(to, (z) => (setTo(z), z < from() && setFrom(z)), 'Precache up to zoom')}
        <span class="muted grow now">map {zoom().toFixed(1)}</span>
      </div>

      <table class="precache-table">
        <thead>
          <tr>
            <th>Zoom</th>
            <th>Tiles</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(row) => (
              <tr>
                <td>{row.mapZoom}</td>
                <td>{Number.isFinite(row.tiles) ? countText(row.tiles, 'tile') : 'too many'}</td>
                <td>{row.tiles === 0 || !Number.isFinite(row.tiles) ? '–' : `${row.known ? '' : '≥ '}${sizeText(row.bytes)}`}</td>
              </tr>
            )}
          </For>
        </tbody>
        <tfoot>
          <tr>
            <td>All</td>
            <td>{tooMany() ? 'too many' : countText(total().tiles, 'tile')}</td>
            <td>{tooMany() ? '–' : `${total().known ? 'about ' : '≥ '}${sizeText(total().bytes)}`}</td>
          </tr>
        </tfoot>
      </table>
      <p class="muted hint">
        <Show when={sampling().done < sampling().of} fallback="Sizes estimated from sampled tiles.">
          Estimating sizes from sampled tiles ({sampling().done} of {sampling().of})…
        </Show>{' '}
        <Show when={space() !== undefined}>The browser grants about {sizeText(space()!)} more.</Show>
        <Show when={atLeast() > 0}> One tile at a time, this takes at least {durationText(atLeast())}.</Show>
      </p>

      <ul class="precache-layers">
        <For each={plan()}>
          {(planned) => (
            <li>
              <strong>{planned.layer.name}</strong>
              <Show when={planned.reason}>{(reason) => <span class="muted"> {reason()}: left out.</span>}</Show>
              <Show when={planned.policy}>
                {(policy) => (
                  <>
                    <span class="muted">
                      {' '}
                      <a href={policy().url} target="_blank" rel="noopener">
                        {policy().operator}
                      </a>{' '}
                      {policy().says}
                      {policy().level === 'forbidden' ? ': left out.' : '.'}
                    </span>
                    <Show when={policy().level === 'warn'}>
                      <div class="segmented" role="radiogroup" aria-label={`Precache ${planned.layer.name}`}>
                        <For each={[['exclude', 'Exclude'], ['slow', 'Slow fetch']] as const}>
                          {([value, label]) => (
                            <label title={value === 'slow' ? `${SLOW_PAUSE_MS} ms between tiles` : undefined}>
                              <input
                                type="radio"
                                name={`restraint-${planned.layer.id}`}
                                checked={(restraint[planned.layer.id] ?? 'exclude') === value}
                                onChange={() => setRestraint(planned.layer.id, value)}
                              />
                              <span>{label}</span>
                            </label>
                          )}
                        </For>
                      </div>
                    </Show>
                  </>
                )}
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={tooMany()}>
        <p class="note error">The deepest zoom has far too many tiles for this area. Choose fewer zoom levels.</p>
      </Show>
      <Show when={tooBig()}>
        <p class="note error">The tiles would not fit in the space the browser grants. Choose fewer zoom levels or layers.</p>
      </Show>
      <div class="row end">
        <button type="button" onClick={() => setOpened(false)}>
          Cancel
        </button>
        <button type="button" class="primary" disabled={total().tiles === 0 || tooMany() || tooBig()} onClick={start}>
          Start
        </button>
      </div>
    </div>
  );
}
