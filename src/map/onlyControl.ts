import type * as maplibregl from 'maplibre-gl';

/** Tabler's stack-front: the top layer of a stack, filled. */
const ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12 4l-8 4l8 4l8 -4l-8 -4" fill="currentColor" /><path d="M8 14l-4 2l8 4l8 -4l-4 -2" /><path d="M8 10l-4 2l8 4l8 -4l-4 -2" /></svg>`;

/**
 * The map's button that shows only the layer whose settings are open, over the bottom
 * layer, or all layers again. Whether one layer is shown alone is the app's state, which
 * the composed style follows; the button only shows and switches it.
 */
export class OnlyControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(toggle: () => void) {
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button.type = 'button';
    this.button.className = 'only-toggle';
    this.button.innerHTML = ICON;
    this.button.onclick = toggle;
    this.container.append(this.button);
  }

  onAdd(): HTMLElement {
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }

  /** Shows whether `layer`, the open one, is shown alone; without an open layer there is none to show. */
  show(on: boolean, layer: string | undefined): void {
    this.button.disabled = layer === undefined;
    this.button.setAttribute('aria-pressed', String(on));
    this.button.title = layer === undefined ? "Open a layer's settings to show it alone" : on ? 'Show all layers again' : `Show only ${layer} and the bottom layer`;
    this.button.setAttribute('aria-label', this.button.title);
  }
}
