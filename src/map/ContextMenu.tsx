import type { Map as MapLibreMap } from 'maplibre-gl';
import { For, onCleanup, onMount, Show } from 'solid-js';
import { menu, setMenu } from '../state/drawing';

/** The context menu of route points, waypoints and spots on the map, kept inside the map container. */
export function ContextMenu(props: { map: MapLibreMap }) {
  let list: HTMLUListElement | undefined;

  const onPointerDown = (e: PointerEvent) => {
    if (list && !list.contains(e.target as Node)) setMenu(undefined);
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));

  return (
    <Show when={menu()} keyed>
      {(m) => {
        // A long-press menu opens under the finger; only a new tap may choose an item.
        let armed = !m.touch;
        // Keep the menu inside the map, using its rendered size (larger on touch screens).
        onMount(() => {
          const container = props.map.getContainer();
          list!.style.left = `${Math.max(0, Math.min(m.x, container.clientWidth - list!.offsetWidth))}px`;
          list!.style.top = `${Math.max(0, Math.min(m.y, container.clientHeight - list!.offsetHeight))}px`;
        });
        return (
          <ul
            ref={list}
            class="context-menu"
            style={{ left: `${m.x}px`, top: `${m.y}px` }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={() => (armed = true)}
          >
            <For each={m.items}>
              {(item) => (
                <li>
                  <button
                    onClick={() => {
                      if (!armed) return;
                      setMenu(undefined);
                      item.run();
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
        );
      }}
    </Show>
  );
}
