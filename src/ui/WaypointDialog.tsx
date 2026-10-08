import { createSignal, Show } from 'solid-js';
import type { MapIcon } from '../model/icon';
import { setWaypointDraft, waypointDraft } from '../state/drawing';
import { addWaypoint, updateWaypoint } from '../state/routes';
import { IconGlyph } from './IconPicker';
import { CloseIcon } from './icons';
import { showModalWhile } from './modal';
import { pickIcon } from './pickIcon';

/**
 * Name, description and icon of a waypoint, in the browser's modal dialog: Esc or Cancel
 * keeps everything as it was, Save needs a name.
 */
export function WaypointDialog() {
  let dialog!: HTMLDialogElement;
  showModalWhile(() => dialog, () => waypointDraft() !== undefined);
  const save = (form: HTMLFormElement, icon: MapIcon | undefined) => {
    const draft = waypointDraft();
    if (!draft) return;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return;
    if (draft.id) updateWaypoint(draft.id, { name, description, icon }, 'Edit waypoint');
    else addWaypoint({ id: crypto.randomUUID(), lngLat: draft.lngLat, name, ...(description && { description }), ...(icon && { icon }) });
    setWaypointDraft(undefined);
  };
  return (
    <dialog ref={dialog} class="dialog form-dialog" aria-label="Waypoint" onClose={() => setWaypointDraft(undefined)}>
      <Show when={waypointDraft()} keyed>
        {(draft) => {
          const [icon, setIcon] = createSignal(draft.icon);
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(e.currentTarget, icon());
              }}
            >
              <h2>{draft.id ? 'Edit waypoint' : 'New waypoint'}</h2>
              <label>
                Name
                <input name="name" required autofocus value={draft.name} placeholder="Viewpoint, café, gravel ahead…" />
              </label>
              <label>
                <span>
                  Description <span class="muted">(optional)</span>
                </span>
                <textarea name="description" rows="3" value={draft.description} />
              </label>
              <div class="row">
                <span class="grow">
                  Icon <span class="muted">(optional)</span>
                </span>
                <button
                  type="button"
                  class="icon-pick"
                  aria-label="Icon of the waypoint"
                  onClick={async () => {
                    const choice = await pickIcon(icon());
                    if (choice !== undefined) setIcon(choice ?? undefined);
                  }}
                >
                  <Show when={icon()} fallback="None">
                    {(glyph) => <IconGlyph icon={glyph()} />}
                  </Show>
                </button>
                <Show when={icon()}>
                  <button type="button" class="icon" aria-label="Remove the icon of the waypoint" onClick={() => setIcon(undefined)}>
                    <CloseIcon />
                  </button>
                </Show>
              </div>
              <div class="row end">
                <button type="button" onClick={() => setWaypointDraft(undefined)}>
                  Cancel
                </button>
                <button type="submit" class="primary">
                  Save
                </button>
              </div>
            </form>
          );
        }}
      </Show>
    </dialog>
  );
}
