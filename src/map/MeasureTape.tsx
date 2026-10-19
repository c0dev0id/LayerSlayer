import type { Map as MapLibreMap } from 'maplibre-gl';
import { createEffect, onCleanup, Show } from 'solid-js';
import { moveTapeEnd, removeTape, tape, tapeLine, type Tape } from '../state/measure';
import { CloseIcon } from '../ui/icons';
import { distanceText } from '../ui/format';
import { MarkerHandle, onMarkerMenu } from './markers';
import { tapeEndAt } from './routeTools';

/**
 * The ends of the measuring tape as markers that can be dragged, each laid on a route it
 * comes near; the end carries the tape's length and a button that takes the tape away.
 */
export function MeasureTape(props: { map: MapLibreMap }) {
  return (
    <Show when={tape() !== undefined}>
      <TapeEndMarker map={props.map} which="start" content={(<div class="tape-end" />) as HTMLElement} />
      <TapeEndMarker
        map={props.map}
        which="end"
        content={
          (
            <div class="tape-end">
              <div class="tape-label">
                <span>
                  {distanceText(tapeLine()?.metres ?? 0)}
                  <Show when={tapeLine()?.route}>{(route) => <span class="tape-route"> along {route().name}</span>}</Show>
                </span>
                <button title="Take the tape away" aria-label="Take the tape away" onClick={removeTape}>
                  <CloseIcon />
                </button>
              </div>
            </div>
          ) as HTMLElement
        }
      />
    </Show>
  );
}

function TapeEndMarker(props: { map: MapLibreMap; which: keyof Tape; content: HTMLElement }) {
  const { map, which } = props;
  const handle = new MarkerHandle(map, props.content, { className: 'tape-end-marker' });
  createEffect(() => {
    const at = tape()?.[which]?.at;
    handle.setPosition(at && [at[0], at[1]]);
  });
  // A finger needs a wider reach than a mouse to land on a route.
  let reach = 10;
  handle.root.addEventListener('pointerdown', (e) => (reach = e.pointerType === 'mouse' ? 10 : 24));
  handle.marker.on('drag', () => {
    const { x, y } = map.project(handle.marker.getLngLat());
    moveTapeEnd(which, tapeEndAt(map, [x, y], reach));
  });
  const stopMenu = onMarkerMenu(handle, map, () => [{ label: 'Take the tape away', run: removeTape }]);
  onCleanup(() => {
    stopMenu();
    handle.remove();
  });
  return null;
}
