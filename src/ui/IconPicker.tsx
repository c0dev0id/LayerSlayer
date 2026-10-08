import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { ICON_SET_IDS, loadIconSet, searchIcons } from '../icons/iconSets';
import type { MapIcon } from '../model/icon';
import { showModalWhile } from './modal';
import { answerIconRequest, iconRequest } from './pickIcon';

/** Most icons shown at once; the sets hold about 7900. */
const LIMIT = 300;

/** An icon as it is drawn: its paths in the current text colour. */
export function IconGlyph(props: { icon: MapIcon }) {
  return (
    <svg class="glyph" viewBox={`0 0 ${props.icon.size[0]} ${props.icon.size[1]}`} aria-hidden="true">
      <For each={props.icon.paths}>{(d) => <path d={d} />}</For>
    </svg>
  );
}

/** An icon as the map shows it: white on a disc of the layer's colour. */
export function IconBadge(props: { icon: MapIcon; color: string }) {
  return (
    <span class="badge-disc" style={{ 'background-color': props.color }} title={props.icon.id}>
      <IconGlyph icon={props.icon} />
    </span>
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
  const [sets] = createResource(
    () => open() || undefined,
    () => Promise.all(ICON_SET_IDS.map(loadIconSet)),
  );
  const [query, setQuery] = createSignal('');
  const [setId, setSetId] = createSignal('');
  const found = createMemo(() => searchIcons((sets() ?? []).filter((s) => !setId() || s.id === setId()), query(), LIMIT));

  return (
    <dialog ref={dialog} class="dialog icon-picker" aria-label="Choose an icon" onClose={() => answerIconRequest(undefined)}>
      <div class="row dialog-title">
        <h2 class="grow">Icon</h2>
        <button onClick={() => answerIconRequest(null)}>No icon</button>
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
      <Show when={sets()} fallback={<p class="muted">{sets.error ? 'The icons could not be loaded.' : 'Loading icons…'}</p>}>
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
          Maki and Temaki (CC0), Material Design Icons (Apache 2.0).
        </p>
      </Show>
    </dialog>
  );
}
