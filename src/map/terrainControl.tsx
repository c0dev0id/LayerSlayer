import type * as maplibregl from 'maplibre-gl';
import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { MAX_SYMBOL_DISTANCE } from '../model/scene';
import { scene, setScene, setTerrain, state } from '../state/store';
import { BuildingIcon, MapPinUpIcon, MoonIcon, SunIcon, TypographyIcon } from '../ui/icons';

/**
 * The map's 3D button: it shows the ground raised by its elevation and shaded by its
 * relief, or flat again, and tilts the map so that the relief shows, or back to looking
 * straight down. While the ground is in 3D, the switches of how the map looks there lie
 * beside it. Both are the app's settings, which the composed style follows; the buttons
 * only show and switch them.
 */
export class TerrainControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  private dispose?: () => void;

  onAdd(map: maplibregl.Map): HTMLElement {
    this.container.className = 'maplibregl-ctrl terrain-control';
    this.dispose = render(() => <TerrainButtons map={map} />, this.container);
    return this.container;
  }

  onRemove(): void {
    this.dispose?.();
    this.container.remove();
  }
}

function TerrainButtons(props: { map: maplibregl.Map }) {
  const on = () => state.settings.terrain === true;
  const title = () => (on() ? 'Flat map' : 'Show the ground in 3D, with hillshading');
  const toggle = () => {
    const raised = !on();
    setTerrain(raised);
    props.map.easeTo({ pitch: raised ? Math.max(props.map.getPitch(), 60) : 0 });
  };
  return (
    <>
      <div class="maplibregl-ctrl-group">
        <button type="button" class="terrain-toggle" aria-pressed={on()} data-sky={on() ? scene().sky : undefined} title={title()} aria-label={title()} onClick={toggle}>
          3D
        </button>
      </div>
      <Show when={on()}>
        <SceneBar />
      </Show>
    </>
  );
}

/** How the map looks in 3D: its sky, whether map styles show their buildings and labels, and how high labels and icons float. */
function SceneBar() {
  // The distance shown while the slider is dragged; it is applied when the slider is let go,
  // as every label and icon is laid out anew for it.
  const [dragged, setDragged] = createSignal<number>();
  const distance = () => dragged() ?? scene().symbolDistance;
  const skyTitle = () => (scene().sky === 'day' ? 'Night sky' : 'Day sky');
  const buildingsTitle = () => (scene().buildings ? 'Hide the buildings of map styles' : 'Show the buildings of map styles');
  const labelsTitle = () => (scene().labels ? 'Hide the labels and icons of map styles' : 'Show the labels and icons of map styles');
  return (
    <div class="maplibregl-ctrl-group scene-bar">
      <button type="button" title={skyTitle()} aria-label={skyTitle()} onClick={() => setScene({ sky: scene().sky === 'day' ? 'night' : 'day' })}>
        {scene().sky === 'day' ? <MoonIcon /> : <SunIcon />}
      </button>
      <button type="button" aria-pressed={scene().buildings} title={buildingsTitle()} aria-label={buildingsTitle()} onClick={() => setScene({ buildings: !scene().buildings })}>
        <BuildingIcon />
      </button>
      <button type="button" aria-pressed={scene().labels} title={labelsTitle()} aria-label={labelsTitle()} onClick={() => setScene({ labels: !scene().labels })}>
        <TypographyIcon />
      </button>
      <label class="symbol-distance" title="Symbol distance: how high labels and icons float above the ground">
        <MapPinUpIcon />
        <input
          type="range"
          min="0"
          max={MAX_SYMBOL_DISTANCE}
          step="10"
          value={distance()}
          aria-label="Symbol distance"
          onInput={(e) => setDragged(e.currentTarget.valueAsNumber)}
          onChange={(e) => {
            setScene({ symbolDistance: e.currentTarget.valueAsNumber });
            setDragged(undefined);
          }}
        />
        <output>{distance()} m</output>
      </label>
    </div>
  );
}
