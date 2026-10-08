import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { filterOsmFeatures, loadOsmFeatures, typedFeature, type OsmFeature } from '../library/osmFeatures';
import type { MapIcon } from '../model/icon';
import { startFocusDrawing } from '../state/drawing';
import { addOsmQueryLayer } from '../state/osmQuery';
import { state } from '../state/store';
import { errorMessage } from '../state/ui';
import { IconPickButton } from './IconPicker';
import { IconGlyph } from './icons';
import { createOutcome, OutcomeNote } from './outcome';

/**
 * A layer of OpenStreetMap features found in the focus area: features chosen from the list
 * or typed in as tags, queried together. Tags typed in join the list at the top. The layer
 * takes the icon of the first chosen feature that has one, unless another is picked.
 */
export function OsmQueryTab(props: { active: boolean; onClose: () => void }) {
  // The list and its icons load the first time the tab is shown, not with the app.
  const shown = createMemo((seen: boolean) => seen || props.active, false);
  const [features] = createResource(shown, loadOsmFeatures);
  const [search, setSearch] = createSignal('');
  const [typed, setTyped] = createSignal<OsmFeature[]>([]);
  const [chosen, setChosen] = createSignal<OsmFeature[]>([]);
  const [tags, setTags] = createSignal('');
  const [tagError, setTagError] = createSignal<string>();
  /** The icon picked for the layer, null for none; undefined takes the chosen features'. */
  const [picked, setPicked] = createSignal<MapIcon | null>();
  const querying = createOutcome();

  /** The list by category, in the order of the list, with typed tags first. */
  const groups = createMemo(() => {
    const byCategory = new Map<string, OsmFeature[]>();
    for (const feature of [...typed(), ...filterOsmFeatures(features() ?? [], search())]) {
      const members = byCategory.get(feature.category);
      if (members) members.push(feature);
      else byCategory.set(feature.category, [feature]);
    }
    return [...byCategory];
  });
  const isChosen = (feature: OsmFeature) => chosen().some((c) => c.name === feature.name);
  const toggle = (feature: OsmFeature) =>
    setChosen(isChosen(feature) ? chosen().filter((c) => c.name !== feature.name) : [...chosen(), feature]);
  const layerName = () => chosen().map((f) => f.name).join(', ');
  const icon = () => {
    const choice = picked();
    return choice === undefined ? chosen().find((f) => f.icon)?.icon : (choice ?? undefined);
  };

  function addTags() {
    try {
      const feature = typedFeature(tags());
      if (!typed().some((t) => t.name === feature.name)) setTyped([...typed(), feature]);
      if (!isChosen(feature)) setChosen([...chosen(), feature]);
      setTags('');
      setTagError(undefined);
    } catch (error) {
      setTagError(errorMessage(error));
    }
  }

  function query() {
    const name = layerName();
    const filters = [...new Set(chosen().flatMap((f) => f.filters))];
    const layerIcon = icon();
    void querying.run(async () => {
      const count = await addOsmQueryLayer(name, filters, layerIcon);
      if (count === 0) return 'Nothing was found in the focus area.';
      setChosen([]);
      setPicked(undefined);
      return `Added ${name}: ${count} ${count === 1 ? 'feature' : 'features'}.`;
    });
  }

  return (
    <div class="osm-query">
      <Show when={!state.focus}>
        <div class="note info">
          <p>OSM queries look within the focus area: the Overpass API answers queries for limited areas only.</p>
          <button
            onClick={() => {
              props.onClose();
              startFocusDrawing();
            }}
          >
            Draw a focus area
          </button>
        </div>
      </Show>
      <input type="search" placeholder="Search features" aria-label="Search OSM features" onInput={(e) => setSearch(e.currentTarget.value)} />
      <ul class="offers">
        <For each={groups()} fallback={<li class="muted">{features.loading ? 'Loading…' : 'Nothing matches.'}</li>}>
          {([category, members]) => (
            <li>
              <h3 class="group">{category}</h3>
              <ul>
                <For each={members}>
                  {(feature) => (
                    <li>
                      <button class="offer" classList={{ added: isChosen(feature) }} aria-pressed={isChosen(feature)} onClick={() => toggle(feature)}>
                        <span class="mark" aria-hidden="true" />
                        <Show when={feature.icon}>{(glyph) => <IconGlyph icon={glyph()} />}</Show>
                        <span class="grow">
                          <span class="name">{feature.name}</span>
                          <Show when={feature.category !== 'Tags'}>
                            <span class="muted id">{feature.filters.join(', ')}</span>
                          </Show>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </li>
          )}
        </For>
      </ul>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          addTags();
        }}
      >
        <input class="grow" placeholder="Tags, e.g. highway=track surface=gravel" aria-label="Tags" value={tags()} onInput={(e) => setTags(e.currentTarget.value)} />
        <button type="submit" disabled={!tags().trim()}>
          Add
        </button>
      </form>
      <Show when={tagError()} fallback={<p class="muted hint">key=value, or key=* for any value. Tags separated by spaces must all match.</p>}>
        {(message) => <p class="note error">{message()}</p>}
      </Show>
      <div class="row">
        <IconPickButton icon={icon()} of="the new layer" onChange={(choice) => setPicked(choice ?? null)} />
        <span class="grow name" classList={{ muted: chosen().length === 0 }} title={layerName()}>
          {chosen().length > 0 ? layerName() : 'Choose features or add tags; together they form one layer.'}
        </span>
        <button class="primary" disabled={!state.focus || chosen().length === 0 || querying.running()} onClick={query}>
          {querying.running() ? 'Querying…' : 'Query'}
        </button>
      </div>
      <OutcomeNote outcome={querying.outcome()} />
      <p class="muted hint">Data © OpenStreetMap contributors, found with the Overpass API.</p>
    </div>
  );
}
