import { Match, Show, Switch } from 'solid-js';
import { focusDraft, startFocusDrawing } from '../state/drawing';
import { cancelPrecache, dismissPrecache, pausePrecache, precacheRun, resumePrecache, type PrecacheRun } from '../state/precache';
import { clearFocus, focusBounds, state } from '../state/store';
import { showBounds } from '../state/ui';
import { countText, durationText, sizeText } from './format';
import { AreaIcon, CloseIcon, DownloadAreaIcon } from './icons';
import { openPrecacheDialog } from './PrecacheDialog';

function showFocus() {
  const bounds = focusBounds();
  if (bounds) showBounds(bounds);
}

/** The focus area: a polygon drawn on the map, outside whose bounds layers request no tiles. */
export function FocusSection() {
  const bottom = () => state.layers[0]?.name;
  return (
    <section class="section">
      <div class="row">
        <h2 class="grow">Focus area</h2>
        <Show when={state.focus}>
          <button
            class="icon"
            title="Precache the focus area: keep tiles of its layers for later"
            aria-label="Precache the focus area"
            disabled={precacheRun()?.status === 'running' || precacheRun()?.status === 'paused'}
            onClick={openPrecacheDialog}
          >
            <DownloadAreaIcon />
          </button>
          <button class="icon" title="Fly to the focus area" aria-label="Fly to the focus area" onClick={showFocus}>
            <AreaIcon />
          </button>
          <button class="icon" title="Remove the focus area" aria-label="Remove the focus area" onClick={clearFocus}>
            <CloseIcon />
          </button>
        </Show>
        <button disabled={focusDraft() !== undefined} onClick={startFocusDrawing}>
          {state.focus ? 'Redraw' : 'Draw'}
        </button>
      </div>
      <p class="muted hint">
        {state.focus ? 'Layers load only within the bounds of the area' : 'Draw an area, and layers load only within its bounds'}
        <Show when={bottom()}>{(name) => <>; {name()}, the bottom layer, loads everywhere</>}</Show>.
      </p>
      <Show when={precacheRun()}>{(run) => <PrecacheProgress run={run()} />}</Show>
    </section>
  );
}

const STATUS: Record<PrecacheRun['status'], string> = {
  running: 'Precaching',
  paused: 'Precaching paused',
  done: 'Precached',
  stopped: 'Precaching stopped: tile after tile failed',
  cancelled: 'Precaching cancelled',
};

/** How precaching goes: tiles done of all, size, speed, time left, and what failed. */
function PrecacheProgress(props: { run: PrecacheRun }) {
  const run = () => props.run;
  const active = () => run().status === 'running' || run().status === 'paused';
  const left = () => (run().tilesPerSecond > 0 ? (run().total - run().done) / run().tilesPerSecond : undefined);
  return (
    <div class="precache-progress">
      <div class="row">
        <strong class="grow">{STATUS[run().status]}</strong>
        <Switch>
          <Match when={run().status === 'running'}>
            <button onClick={pausePrecache}>Pause</button>
          </Match>
          <Match when={run().status === 'paused'}>
            <button onClick={resumePrecache}>Resume</button>
          </Match>
        </Switch>
        <Show
          when={active()}
          fallback={
            <button class="icon" title="Forget these numbers" aria-label="Forget the precache numbers" onClick={dismissPrecache}>
              <CloseIcon />
            </button>
          }
        >
          <button onClick={cancelPrecache}>Cancel</button>
        </Show>
      </div>
      <progress max={run().total} value={run().done} />
      <div class="precache-stats">
        <span>
          {countText(run().done, 'tile')} of {run().total.toLocaleString('en-US')}
        </span>
        <span>{sizeText(run().bytes)} fetched</span>
        <Show when={run().status === 'running' && run().tilesPerSecond > 0}>
          <span>
            {run().tilesPerSecond.toFixed(1)} tiles/s, {sizeText(run().bytesPerSecond)}/s
          </span>
          <Show when={left()}>{(seconds) => <span>about {durationText(seconds())} left</span>}</Show>
        </Show>
      </div>
      <Show when={run().kept || run().missing || run().failed}>
        <p class="muted hint">
          {[run().kept && `${run().kept.toLocaleString('en-US')} kept already`, run().missing && `${run().missing.toLocaleString('en-US')} missing on the server`, run().failed && `${run().failed.toLocaleString('en-US')} failed`]
            .filter(Boolean)
            .join(', ')}
          .
        </p>
      </Show>
      <Show when={run().lastError}>{(error) => <p class="note error">{error()}</p>}</Show>
    </div>
  );
}
