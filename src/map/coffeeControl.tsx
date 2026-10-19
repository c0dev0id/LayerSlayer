import type * as maplibregl from 'maplibre-gl';
import { CoffeeIcon } from '../ui/icons';

/** Where those who like the app can buy its author a coffee. */
export const COFFEE_URL = 'https://buymeacoffee.com/shagen';

/** A cup on the map that links to COFFEE_URL, in a new tab. */
export class CoffeeControl implements maplibregl.IControl {
  private readonly container = (
    <div class="maplibregl-ctrl maplibregl-ctrl-group">
      <a class="coffee-link" href={COFFEE_URL} target="_blank" rel="noopener" title="Buy me a coffee" aria-label="Buy me a coffee">
        <CoffeeIcon />
      </a>
    </div>
  ) as HTMLElement;

  onAdd(): HTMLElement {
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}
