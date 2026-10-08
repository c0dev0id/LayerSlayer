import { Show } from 'solid-js';
import { focusDraft, startFocusDrawing } from '../state/drawing';
import { clearFocus, focusBounds, state } from '../state/store';
import { showBounds } from '../state/ui';
import { AreaIcon, CloseIcon } from './icons';

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
    </section>
  );
}
