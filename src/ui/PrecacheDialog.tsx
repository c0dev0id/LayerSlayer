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
  type PrecacheJob,
} from '../state/precache';
import { state } from '../state/store';
import { zoom } from '../state/ui';
import { countText, durationText, sizeText } from './format';
import { showModalWhile } from './modal';
import { Segmented, type SegmentedOption } from './Segmented';

const [opened, setOpened] = createSignal(false);

/** Opens the dialog that sets up precaching the focus area. */
export function openPrecacheDialog(): void {
  setOpened(true);
}

/** What to do with a layer whose server asks for restraint: leave it out, or fetch it slowly. */
type Restraint = 'exclude' | 'slow';

const RESTRAINTS: SegmentedOption<Restraint>[] = [
  { value: 'exclude', label: 'Exclude' },
  { value: 'slow', label: 'Slow fetch', title: `${SLOW_PAUSE_MS} ms between tiles` },
];

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

  const plan = createMemo(() => planPrecache(chosenLayers(choice(), state.layers, state.activeLayerId), props.area, from(), to()));
  /** The zooms of each layer not left out, with the pause after each of its tiles. */
  const jobs = createMemo(() =>
    plan().flatMap((planned): PrecacheJob[] => {
      if (!planned.source || planned.policy?.level === 'forbidden') return [];
      if (planned.policy?.level === 'warn' && restraint[planned.layer.id] !== 'slow') return [];
      const pause = planned.policy ? SLOW_PAUSE_MS : PAUSE_MS;
      return planned.zooms.map((zoom) => ({ source: planned.source, ...zoom, pause }));
    }),
  );

  createEffect(
    on(jobs, (jobs) => {
      const controller = new AbortController();
      void sampleTiles(jobs, props.area, controller.signal).catch(() => {});
      onCleanup(() => controller.abort());
    }),
  );

  /** Per map zoom: tiles, estimated bytes, and whether every size is known. */
  const rows = createMemo(() => {
    const byZoom = new Map<number, { tiles: number; bytes: number; known: boolean }>();
    for (const { source, mapZoom, z, count } of jobs()) {
      const row = byZoom.get(mapZoom) ?? { tiles: 0, bytes: 0, known: true };
      const bytes = count === 0 ? 0 : estimatedBytes(source, z, count);
      byZoom.set(mapZoom, { tiles: row.tiles + count, bytes: row.bytes + (bytes ?? 0), known: row.known && bytes !== undefined });
    }
    return [...byZoom].sort(([a], [b]) => a - b).map(([mapZoom, row]) => ({ mapZoom, ...row }));
  });
  const total = createMemo(() => rows().reduce((sum, row) => ({ tiles: sum.tiles + row.tiles, bytes: sum.bytes + row.bytes, known: sum.known && row.known }), { tiles: 0, bytes: 0, known: true }));
  const sampling = createMemo(() => {
    const wanted = jobs().filter((job) => Number.isFinite(job.count) && job.count > 0);
    return { done: wanted.filter((job) => sampled(job.source, job.z)).length, of: wanted.length };
  });
  const atLeast = createMemo(() => jobs().reduce((sum, job) => sum + job.count * job.pause, 0) / 1000);
  const [space] = createResource(async () => {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.quota !== undefined ? estimate.quota - (estimate.usage ?? 0) : undefined;
  });
  const tooMany = () => !Number.isFinite(total().tiles);
  const tooBig = () => space() !== undefined && total().bytes > space()!;

  const start = () => {
    void startPrecache(jobs(), props.area);
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
        <Segmented
          options={[
            { value: 'open', label: 'Open layer', disabled: !state.activeLayerId, ...(!state.activeLayerId && { title: 'Open a layer’s settings to choose it' }) },
            { value: 'visible', label: 'Visible' },
            { value: 'all', label: 'All' },
          ]}
          value={choice()}
          onChange={setChoice}
          name="precache-layers"
          label="Layers to precache"
        />
      </div>
      <div class="row">
        <span class="label">Zoom</span>
        {zoomInput(
          from,
          (z) => {
            setFrom(z);
            if (z > to()) setTo(z);
          },
          'Precache from zoom',
        )}
        <span class="muted">to</span>
        {zoomInput(
          to,
          (z) => {
            setTo(z);
            if (z < from()) setFrom(z);
          },
          'Precache up to zoom',
        )}
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
                      <Segmented
                        options={RESTRAINTS}
                        value={restraint[planned.layer.id] ?? 'exclude'}
                        onChange={(value) => setRestraint(planned.layer.id, value)}
                        name={`restraint-${planned.layer.id}`}
                        label={`Precache ${planned.layer.name}`}
                      />
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
