import type { JSX } from 'solid-js';

/**
 * A button that opens a small panel of style settings beside it: a native popover, placed
 * under its button by CSS anchor positioning and closed by a click elsewhere or Esc. `id`
 * must be unique on the page; it names the popover and its anchor.
 */
export function StylePopover(props: { id: string; title: string; label: string; icon: JSX.Element; children: JSX.Element }) {
  return (
    <>
      <button class="icon" popovertarget={props.id} title={props.title} aria-label={props.label} style={`anchor-name: --${props.id}`}>
        {props.icon}
      </button>
      <div id={props.id} popover class="style-panel" style={`position-anchor: --${props.id}`}>
        {props.children}
      </div>
    </>
  );
}
