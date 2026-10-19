import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, onCleanup, Show, type JSX } from 'solid-js';
import { moveTapeEnd, removeTape, tape, tapeLine, type Tape } from '../state/measure';
import { CloseIcon } from '../ui/icons';
import { distanceText } from '../ui/format';
import { MarkerHandle, onMarkerMenu } from './markers';
import { tapeEndAt } from './routeTools';
import { tapReach } from './tapFilter';

/**
 * The ends of the measuring tape as markers that can be dragged, each laid on a route it
 * comes near; the end carries the tape's length and a button that takes the tape away.
 */
export function MeasureTape(props: { map: MapLibreMap }) {
  return (
    <Show when={tape() !== undefined}>
      <TapeEndMarker map={props.map} which="start" />
      <TapeEndMarker map={props.map} which="end">
        <div class="tape-label">
          <span>
            {distanceText(tapeLine()?.metres ?? 0)}
            <Show when={tapeLine()?.route}>{(route) => <span class="tape-route"> along {route().name}</span>}</Show>
          </span>
          <button class="icon" title="Take the tape away" aria-label="Take the tape away" onClick={removeTape}>
            <CloseIcon />
          </button>
        </div>
      </TapeEndMarker>
    </Show>
  );
}

function TapeEndMarker(props: { map: MapLibreMap; which: keyof Tape; children?: JSX.Element }) {
  const { map, which } = props;
  const handle = new MarkerHandle(map, (<div class="tape-end">{props.children}</div>) as HTMLElement, { className: 'tape-end-marker' });
  createEffect(() => handle.setPosition(tape()?.[which]?.at));
  let touch = false;
  handle.root.addEventListener('pointerdown', (e) => (touch = e.pointerType !== 'mouse'));
  handle.marker.on('drag', () => {
    const { x, y } = map.project(handle.marker.getLngLat());
    moveTapeEnd(which, tapeEndAt(map, [x, y], tapReach(touch)));
  });
  const stopMenu = onMarkerMenu(handle, map, () => [{ label: 'Take the tape away', run: removeTape }]);
  onCleanup(() => {
    stopMenu();
    handle.remove();
  });
  return null;
}
