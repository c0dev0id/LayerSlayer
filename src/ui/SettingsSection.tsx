import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js';
import { clearTileCache, TILE_MAX_AGE_HOURS, tileCacheStats } from '../map/tileCache';
import { setHostProxied, setProxyAddress, setProxyMode, setTileCacheOff, state, type ProxyMode } from '../state/store';
import { askConfirmation } from './confirm';
import { countText, sizeText } from './format';
import { CloseIcon, PencilIcon, SaveIcon } from './icons';

const PROXY_MODES: { mode: ProxyMode; label: string; title: string }[] = [
  { mode: 'off', label: 'Off', title: 'No request goes through the proxy' },
  { mode: 'hosts', label: 'Per layer', title: 'Requests to the hosts below go through the proxy' },
  { mode: 'all', label: 'All layers', title: 'Every layer goes through the proxy, as if each had it ticked' },
];

/**
 * The tile cache and the CORS proxy. A switch turns the cache off for every layer, and the
 * proxy can be off, used for the hosts chosen for it, or used for every layer (for testing),
 * without touching the layers' own settings.
 */
export function SettingsSection() {
  const [opened, setOpened] = createSignal(false);
  // Measured each time the section opens, not on every tile.
  const [cached, { refetch }] = createResource(opened, () => tileCacheStats().catch(() => ({ tiles: 0, bytes: 0 })));
  return (
    <details class="section settings" onToggle={(e) => setOpened(e.currentTarget.open)}>
      <summary>
        <h2>Settings</h2>
      </summary>
      <div class="setting">
        <div class="row">
          <label class="row grow">
            <input type="checkbox" checked={!state.settings.tileCacheOff} onChange={(e) => setTileCacheOff(!e.currentTarget.checked)} />
            <strong>Tile cache</strong>
          </label>
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
        <div class="cache-stats">
          <span>{cached() ? countText(cached()!.tiles, 'tile') : '…'}</span>
          <span>{cached() ? sizeText(cached()!.bytes) : ''}</span>
        </div>
        <p class="muted hint">
          Layers that keep their tiles answer them from this browser for {TILE_MAX_AGE_HOURS} hours. Switched off, no layer reads or keeps
          tiles, whatever its own setting.
        </p>
      </div>
      <div class="setting">
        <div class="row">
          <strong class="grow">CORS proxy</strong>
          <div class="segmented" role="radiogroup" aria-label="Requests through the CORS proxy">
            <For each={PROXY_MODES}>
              {({ mode, label, title }) => (
                <label title={title}>
                  <input
                    type="radio"
                    name="proxy-mode"
                    checked={(state.settings.proxyMode ?? 'hosts') === mode}
                    onChange={() => setProxyMode(mode)}
                  />
                  <span>{label}</span>
                </label>
              )}
            </For>
          </div>
        </div>
        <ProxyAddress />
        <p class="muted hint">
          Servers that send no CORS headers cannot be read by a web page. A proxy you run fetches them instead: {'{url}'} in its address is
          replaced by the encoded target. <em>Per layer</em>, the hosts below use it; with <em>All layers</em>, every layer does.
          OpenStreetMap queries and details never use it.
        </p>
        <Switch>
          <Match when={state.settings.proxyMode === 'all'}>
            <p class="hosts-all">All layers use the proxy.</p>
          </Match>
          <Match when={state.settings.proxiedHosts.length === 0}>
            <p class="muted hint">No host uses the proxy.</p>
          </Match>
          <Match when={true}>
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
          </Match>
        </Switch>
      </div>
    </details>
  );
}

/**
 * The proxy address as text, changed with the pencil: it then becomes a field whose save
 * button (or Enter) keeps it, and Esc leaves it as it was. An address without {url} is
 * kept only once confirmed, as the target appended to it loses its own query at most proxies.
 */
function ProxyAddress() {
  const [draft, setDraft] = createSignal<string>();
  let field: HTMLInputElement | undefined;
  const save = async () => {
    const address = (draft() ?? '').trim();
    if (address && !address.includes('{url}')) {
      const message =
        'The address has no {url}. Without it the target address is appended as it is, and a target with its own query (?a=1&b=2) loses everything after its first & at most proxies.';
      if (!(await askConfirmation(message, 'Save anyway'))) return field?.focus();
    }
    setProxyAddress(address);
    setDraft(undefined);
  };
  return (
    <div class="row proxy-address">
      <Show
        when={draft() !== undefined}
        fallback={
          <>
            <span class="grow proxy-text" classList={{ muted: !state.settings.proxy }}>
              {state.settings.proxy || 'No proxy address'}
            </span>
            <button class="icon" title="Change the proxy address" aria-label="Change the CORS proxy address" onClick={() => setDraft(state.settings.proxy)}>
              <PencilIcon />
            </button>
          </>
        }
      >
        <input
          ref={(el) => {
            field = el;
            queueMicrotask(() => el.focus());
          }}
          class="grow"
          type="url"
          placeholder="https://proxy.example/?url={url}"
          aria-label="CORS proxy address"
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDraft(undefined);
            }
          }}
        />
        <button class="icon" title="Save the proxy address" aria-label="Save the CORS proxy address" onClick={() => void save()}>
          <SaveIcon />
        </button>
      </Show>
    </div>
  );
}
