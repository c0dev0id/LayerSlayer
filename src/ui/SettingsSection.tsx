import { For, Show } from 'solid-js';
import { setHostProxied, setProxyAddress, state } from '../state/store';
import { CloseIcon } from './icons';

/** The CORS proxy and the hosts that go through it. */
export function SettingsSection() {
  return (
    <details class="section settings">
      <summary>
        <h2>Settings</h2>
      </summary>
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
