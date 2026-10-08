import { createSignal, Show } from 'solid-js';
import type { MapIcon } from '../model/icon';
import { setWaypointDraft, waypointDraft } from '../state/drawing';
import { addWaypoint, updateWaypoint } from '../state/routes';
import { IconPickButton } from './IconPicker';
import { showModalWhile } from './modal';

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
    if ('id' in draft) updateWaypoint(draft.id, { name, description, icon }, 'Edit waypoint');
    else addWaypoint({ id: crypto.randomUUID(), routeId: draft.routeId, lngLat: draft.lngLat, name, ...(description && { description }), ...(icon && { icon }) });
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
              <h2>{'id' in draft ? 'Edit waypoint' : 'New waypoint'}</h2>
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
                <IconPickButton icon={icon()} of="the waypoint" onChange={setIcon} />
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
