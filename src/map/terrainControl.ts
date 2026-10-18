import type * as maplibregl from 'maplibre-gl';
import type { TerrainSky } from './compose';

/** Each click goes from the flat map to 3D under a day sky, then under a night sky, then flat again. */
const NEXT: Record<TerrainSky | 'flat', TerrainSky | undefined> = { flat: 'day', day: 'night', night: undefined };

/** What the next click does, for the button's title. */
const ACTION: Record<TerrainSky | 'flat', string> = {
  flat: 'Show the ground in 3D, with hillshading',
  day: 'Night sky',
  night: 'Flat map',
};

/**
 * The map's 3D button: it shows the ground raised by its elevation and shaded by its relief,
 * under a day or a night sky, or flat again, and tilts the map so that the relief shows, or
 * back to looking straight down. Which it is is the app's setting, which the composed style
 * follows; the button only shows and switches it.
 */
export class TerrainControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(
    private readonly current: () => TerrainSky | undefined,
    private readonly set: (sky: TerrainSky | undefined) => void,
  ) {
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button.type = 'button';
    this.button.className = 'terrain-toggle';
    this.button.textContent = '3D';
    this.container.append(this.button);
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.button.onclick = () => {
      const was = this.current();
      const sky = NEXT[was ?? 'flat'];
      this.set(sky);
      if (!was) map.easeTo({ pitch: Math.max(map.getPitch(), 60) });
      if (!sky) map.easeTo({ pitch: 0 });
    };
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }

  /** Shows whether the ground is in 3D, and under which sky. */
  show(sky: TerrainSky | undefined): void {
    this.button.setAttribute('aria-pressed', String(!!sky));
    this.button.dataset.sky = sky ?? 'flat';
    this.button.title = ACTION[sky ?? 'flat'];
    this.button.setAttribute('aria-label', this.button.title);
  }
}
