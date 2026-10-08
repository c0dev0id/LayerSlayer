import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { ICON_SETS, searchIcons } from '../icons/iconSets';
import type { IconSet, MapIcon } from '../model/icon';
import { CloseIcon, IconBadge, IconGlyph } from './icons';
import { showModalWhile } from './modal';
import { answerIconRequest, iconRequest, pickIcon } from './pickIcon';

/** Most icons shown at once; the sets hold about 7900. */
const LIMIT = 300;

/**
 * The icon of a layer, a waypoint or a layer to come: a tap opens the picker, × takes the
 * icon away. With a colour the icon shows as the map draws it, white on a disc.
 */
export function IconPickButton(props: { icon: MapIcon | undefined; color?: string; of: string; onChange: (icon: MapIcon | undefined) => void }) {
  return (
    <>
      <button
        type="button"
        class="icon-pick"
        aria-label={`Icon of ${props.of}`}
        onClick={async () => {
          const icon = await pickIcon(props.icon);
          if (icon) props.onChange(icon);
        }}
      >
        <Show when={props.icon} fallback="None">
          {(icon) => (props.color ? <IconBadge icon={icon()} color={props.color} /> : <IconGlyph icon={icon()} />)}
        </Show>
      </button>
      <Show when={props.icon}>
        <button type="button" class="icon" title="No icon" aria-label={`Remove the icon of ${props.of}`} onClick={() => props.onChange(undefined)}>
          <CloseIcon />
        </button>
      </Show>
    </>
  );
}

/**
 * The open icon request (pickIcon), in a modal dialog of the page: the icon sets, searched
 * by name and keyword and narrowed to one set if wanted. A tap chooses; Esc or Close
 * leaves the icon as it was.
 */
export function IconPicker() {
  let dialog!: HTMLDialogElement;
  const open = () => iconRequest() !== undefined;
  showModalWhile(() => dialog, open);
  // The sets load when the picker first opens, and each is shown as it arrives: the map
  // sets are small, Material Design Icons take longer.
  const opened = createMemo((seen: boolean) => seen || open(), false);
  const loading = ICON_SETS.map((load) => createResource(opened, load)[0]);
  const sets = () => loading.map((set) => set()).filter((set): set is IconSet => set !== undefined);
  const [query, setQuery] = createSignal('');
  const [setId, setSetId] = createSignal('');
  const found = createMemo(() => searchIcons((sets() ?? []).filter((s) => !setId() || s.id === setId()), query(), LIMIT));

  return (
    <dialog ref={dialog} class="dialog icon-picker" aria-label="Choose an icon" onClose={() => answerIconRequest(undefined)}>
      <div class="row dialog-title">
        <h2 class="grow">Icon</h2>
        <button class="primary" onClick={() => answerIconRequest(undefined)}>
          Close
        </button>
      </div>
      <div class="row filters">
        <input class="grow" type="search" placeholder="Search icons" aria-label="Search icons" value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
        <select aria-label="Icon set" value={setId()} onChange={(e) => setSetId(e.currentTarget.value)}>
          <option value="">All sets</option>
          <For each={sets()}>{(set) => <option value={set.id}>{set.name}</option>}</For>
        </select>
      </div>
      <Show when={sets().length > 0} fallback={<p class="muted">{loading.some((set) => set.error) ? 'The icons could not be loaded.' : 'Loading icons…'}</p>}>
        <div class="icon-grid">
          <For each={found().icons}>
            {(icon) => (
              <button
                class="icon-choice"
                classList={{ selected: icon.id === iconRequest()?.current?.id }}
                title={icon.id}
                aria-label={icon.id}
                onClick={() => answerIconRequest(icon)}
              >
                <IconGlyph icon={icon} />
              </button>
            )}
          </For>
        </div>
        <p class="muted hint">
          {found().total === 0
            ? 'No icon matches.'
            : found().total > LIMIT
              ? `${found().total - LIMIT} more; narrow the search to see them.`
              : `${found().total} icons.`}{' '}
          {loading.some((set) => set.loading) ? 'More are loading. ' : ''}
          Maki and Temaki (CC0), Material Design Icons (Apache 2.0).
        </p>
      </Show>
    </dialog>
  );
}
