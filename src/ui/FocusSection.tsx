import { Match, Show, Switch } from 'solid-js';
import { focusDraft, startFocusDrawing } from '../state/drawing';
import { cancelPrecache, dismissPrecache, pausePrecache, precacheActive, precacheRun, resumePrecache, type PrecacheRun } from '../state/precache';
import { MAP_BACKGROUND } from '../map/compose';
import { autoShadowColor } from '../map/focusShadow';
import { clearFocus, focusBounds, setFocusOutline, setFocusShadow, state } from '../state/store';
import { showBounds } from '../state/ui';
import { countText, durationText, sizeText } from './format';
import { AreaIcon, CloseIcon, DownloadAreaIcon } from './icons';
import { openPrecacheDialog } from './PrecacheDialog';

function showFocus() {
  const bounds = focusBounds();
  if (bounds) showBounds(bounds);
}

/** The focus area: a polygon drawn on the map, outside which the layers are covered and request no tiles beyond its bounds. */
export function FocusSection() {
  return (
    <section class="section">
      <div class="row">
        <h2 class="grow">Focus area</h2>
        <Show when={state.focus}>
          <button
            class="icon"
            title="Precache the focus area: keep tiles of its layers for later"
            aria-label="Precache the focus area"
            disabled={precacheActive()}
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
        {state.focus ? 'Layers load and show only within the area.' : 'Draw an area, and layers load and show only within it.'}
      </p>
      <Show when={state.focus}>
        <div class="row focus-color" title="The colour of the line around the area">
          <span class="muted grow">Outline</span>
          <input
            type="color"
            class="swatch"
            aria-label="Outline colour of the focus area"
            value={state.settings.focusOutline ?? '#ffffff'}
            onInput={(e) => setFocusOutline(e.currentTarget.value)}
          />
          <Show when={state.settings.focusOutline}>
            <button class="icon" title="Back to the colour of the coastlines" aria-label="Reset the outline colour" onClick={() => setFocusOutline(undefined)}>
              <CloseIcon />
            </button>
          </Show>
        </div>
        <div class="row focus-color" title="The colour of the shadow the area casts">
          <span class="muted grow">Shadow</span>
          <input
            type="color"
            class="swatch"
            aria-label="Shadow colour of the focus area"
            value={state.settings.focusShadow ?? autoShadowColor(state.settings.background ?? MAP_BACKGROUND)}
            onInput={(e) => setFocusShadow(e.currentTarget.value)}
          />
          <Show when={state.settings.focusShadow}>
            <button class="icon" title="Back to a shadow that suits the background" aria-label="Reset the shadow colour" onClick={() => setFocusShadow(undefined)}>
              <CloseIcon />
            </button>
          </Show>
        </div>
      </Show>
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
          when={precacheActive()}
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
          {run().done.toLocaleString('en-US')} of {countText(run().total, 'tile')}
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
          {[run().kept && `${countText(run().kept, 'tile')} kept already`, run().missing && `${countText(run().missing, 'tile')} missing on the server`, run().failed && `${countText(run().failed, 'tile')} failed`]
            .filter(Boolean)
            .join(', ')}
          .
        </p>
      </Show>
      <Show when={run().lastError}>{(error) => <p class="note error">{error()}</p>}</Show>
    </div>
  );
}
