import type * as maplibregl from 'maplibre-gl';

/**
 * The map's 3D button: it shows the ground raised by its elevation and shaded by its relief,
 * or flat again, and tilts the map so that the relief shows, or back to looking straight down. Whether 3D is on is
 * the app's setting, which the composed style follows; the button only shows and switches it.
 */
export class TerrainControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(
    private readonly isOn: () => boolean,
    private readonly setOn: (on: boolean) => void,
  ) {
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button.type = 'button';
    this.button.className = 'terrain-toggle';
    this.button.textContent = '3D';
    this.container.append(this.button);
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.button.onclick = () => {
      const on = !this.isOn();
      this.setOn(on);
      map.easeTo({ pitch: on ? Math.max(map.getPitch(), 60) : 0 });
    };
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }

  /** Shows whether 3D is on. */
  show(on: boolean): void {
    this.button.setAttribute('aria-pressed', String(on));
    this.button.title = on ? 'Flat map' : 'Show the ground in 3D, with hillshading';
    this.button.setAttribute('aria-label', this.button.title);
  }
}
