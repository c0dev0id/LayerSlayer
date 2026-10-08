import * as maplibregl from 'maplibre-gl';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { Bounds } from '../model/layer';
import { NOMINATIM_ATTRIBUTION, NOMINATIM_MIN_INTERVAL_MS, parsePlaces, searchUrl, type Place } from '../services/nominatim';
import { fetchResource } from '../state/net';
import { errorMessage } from '../state/ui';
import { CloseIcon, SearchIcon } from '../ui/icons';

/** When the last search went out, to keep to Nominatim's one request per second. */
let lastSearch = 0;

/**
 * Searches places and addresses with Nominatim, preferring those in view. The first place
 * found gets a pin and the map flies to it; the list of places found offers the others.
 * Narrow screens show a button in its place, which opens the search; moving or tapping the
 * map, Esc or clearing folds it again, keeping the query and the pin.
 */
export function SearchBox(props: { map: maplibregl.Map }) {
  const map = props.map;
  const [query, setQuery] = createSignal('');
  const [places, setPlaces] = createSignal<Place[]>();
  const [shown, setShown] = createSignal<Place>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [open, setOpen] = createSignal(false);
  const pin = new maplibregl.Marker({ color: '#e03131' });
  let input!: HTMLInputElement;

  const show = (place: Place) => {
    setShown(place);
    pin.setLngLat(place.lngLat).addTo(map);
    pin.getElement().title = place.label;
    if (place.bounds) map.fitBounds(place.bounds, { padding: 40, maxZoom: 17 });
    else map.flyTo({ center: place.lngLat, zoom: 16 });
  };

  const search = async () => {
    const text = query().trim();
    if (!text || busy()) return;
    setBusy(true);
    setError(undefined);
    try {
      const wait = lastSearch + NOMINATIM_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastSearch = Date.now();
      const view = map.getBounds();
      const near: Bounds = [Math.max(-180, view.getWest()), view.getSouth(), Math.min(180, view.getEast()), view.getNorth()];
      const found = parsePlaces(await (await fetchResource(searchUrl(text, near))).json());
      setPlaces(found);
      if (found[0]) show(found[0]);
      else setError(`Nothing found for “${text}”.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setQuery('');
    setPlaces(undefined);
    setShown(undefined);
    setError(undefined);
    pin.remove();
    setOpen(false);
  };

  // The list closes once the map is moved by hand; the flight to a place leaves it open.
  const onMoveStart = (e: { originalEvent?: Event }) => {
    if (!e.originalEvent) return;
    setPlaces(undefined);
    setOpen(false);
  };
  const fold = () => setOpen(false);
  map.on('movestart', onMoveStart);
  map.on('click', fold);
  onCleanup(() => {
    map.off('movestart', onMoveStart);
    map.off('click', fold);
    pin.remove();
  });

  return (
    <div class="search" classList={{ open: open() }}>
      <button
        type="button"
        class="search-toggle"
        title="Search a place or address"
        aria-label="Search a place or address"
        onClick={() => {
          setOpen(true);
          input.focus();
        }}
      >
        <SearchIcon />
      </button>
      <form
        class="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          ref={input}
          type="text"
          enterkeyhint="search"
          placeholder="Search a place or address"
          aria-label="Search a place or address"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            if (places()) setPlaces(undefined);
            else setOpen(false);
          }}
        />
        <Show when={query() || shown()}>
          <button type="button" class="icon" title="Clear the search and its pin" aria-label="Clear the search" onClick={clear}>
            <CloseIcon />
          </button>
        </Show>
        <button type="submit" class="icon" title="Search" aria-label="Search" disabled={busy()}>
          <SearchIcon />
        </button>
      </form>
      <Show when={error()}>{(message) => <p class="search-note">{message()}</p>}</Show>
      <Show when={places()?.length}>
        <ul class="search-results">
          <For each={places()}>
            {(place) => (
              <li>
                <button
                  classList={{ current: shown() === place }}
                  onClick={() => {
                    show(place);
                    setPlaces(undefined);
                  }}
                >
                  {place.label}
                </button>
              </li>
            )}
          </For>
          <li class="search-note">{NOMINATIM_ATTRIBUTION}</li>
        </ul>
      </Show>
    </div>
  );
}
