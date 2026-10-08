import { createResource, createSignal, For, Show } from 'solid-js';
import { clearTileCache, TILE_MAX_AGE_HOURS, tileCacheStats } from '../map/tileCache';
import { setHostProxied, setProxyAddress, state } from '../state/store';
import { CloseIcon } from './icons';

/** The CORS proxy and the hosts that go through it, and the tile cache. */
export function SettingsSection() {
  const [opened, setOpened] = createSignal(false);
  // Measured each time the section opens, not on every tile.
  const [cached, { refetch }] = createResource(opened, () => tileCacheStats().catch(() => ({ tiles: 0, bytes: 0 })));
  const kept = () => {
    const c = cached();
    return c ? `${c.tiles}, ${(c.bytes / 1e6).toFixed(1)} MB` : '…';
  };
  return (
    <details class="section settings" onToggle={(e) => setOpened(e.currentTarget.open)}>
      <summary>
        <h2>Settings</h2>
      </summary>
      <div class="row field-row">
        <span class="grow">
          Tiles kept: {kept()} <span class="muted">(each for {TILE_MAX_AGE_HOURS} hours)</span>
        </span>
        <button
          disabled={!cached()?.tiles}
          onClick={async () => {
            await clearTileCache();
            void refetch();
          }}
        >
          Clear
        </button>
      </div>
      <label class="field">
        <span>CORS proxy</span>
        <input
          type="url"
          placeholder="https://proxy.example/?url={url}"
          value={state.settings.proxy}
          onChange={(e) => setProxyAddress(e.currentTarget.value)}
        />
      </label>
      <p class="muted hint">
        Servers that send no CORS headers cannot be read by a web page. A proxy you run fetches them instead: {'{url}'} in
        its address is replaced by the encoded target, without it the target is appended. Only the hosts below use it.
      </p>
      <Show when={state.settings.proxiedHosts.length > 0} fallback={<p class="muted hint">No host uses the proxy.</p>}>
        <ul class="hosts">
          <For each={state.settings.proxiedHosts}>
            {(host) => (
              <li class="row">
                <span class="grow name">{host}</span>
                <button class="icon" aria-label={`Stop using the proxy for ${host}`} onClick={() => setHostProxied(host, false)}>
                  <CloseIcon />
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </details>
  );
}
