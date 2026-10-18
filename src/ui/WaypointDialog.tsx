import { createSignal, For, Show } from 'solid-js';
import type { MapIcon } from '../model/icon';
import { waypointLook } from '../model/route';
import { WAYPOINT_TYPES, type WaypointType } from '../model/waypointType';
import { setWaypointDraft, waypointDraft, type WaypointDraft } from '../state/drawing';
import { addWaypoint, routeById, routeData, updateWaypoint } from '../state/routes';
import { IconPickButton } from './IconPicker';
import { WaypointPin } from './icons';
import { showModalWhile } from './modal';
import { WaypointShape } from './WaypointShape';

/** Waypoints in the type list are drawn at this share of their size on the map. */
const TYPE_SCALE = 0.75;

/**
 * Name, description and type of a waypoint, in the browser's modal dialog: Esc or Cancel
 * keeps everything as it was, Save needs a name. A plain pin can carry a symbol of the icon
 * sets; the other types are drawn as their own shapes.
 */
export function WaypointDialog() {
  let dialog!: HTMLDialogElement;
  showModalWhile(() => dialog, () => waypointDraft() !== undefined);
  const save = (form: HTMLFormElement, type: WaypointType | undefined, icon: MapIcon | undefined) => {
    const draft = waypointDraft();
    if (!draft) return;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!name) return;
    const symbol = type ? undefined : icon;
    if ('id' in draft) updateWaypoint(draft.id, { name, description, type, icon: symbol }, 'Edit waypoint');
    else {
      const waypoint = { id: crypto.randomUUID(), routeId: draft.routeId, lngLat: draft.lngLat, name };
      addWaypoint({ ...waypoint, ...(description && { description }), ...(type && { type }), ...(symbol && { icon: symbol }) });
    }
    setWaypointDraft(undefined);
  };
  return (
    <dialog ref={dialog} class="dialog form-dialog" aria-label="Waypoint" onClose={() => setWaypointDraft(undefined)}>
      <Show when={waypointDraft()} keyed>
        {(draft) => {
          const [type, setType] = createSignal(draft.type);
          const [icon, setIcon] = createSignal(draft.icon);
          const pinColor = () => waypointLook(routeById(routeOf(draft))).pin;
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(e.currentTarget, type(), icon());
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
              <fieldset class="waypoint-types">
                <legend>Type</legend>
                <label title="A pin, with a symbol of your choice">
                  <input type="radio" name="type" checked={!type()} onChange={() => setType(undefined)} />
                  <WaypointPin icon={icon()} scale={TYPE_SCALE} color={pinColor()} />
                  <span>Pin</span>
                </label>
                <For each={WAYPOINT_TYPES}>
                  {(t) => (
                    <label title={t.name}>
                      <input type="radio" name="type" checked={type() === t.id} onChange={() => setType(t.id)} />
                      <WaypointShape type={t.id} scale={TYPE_SCALE} />
                      <span>{t.name}</span>
                    </label>
                  )}
                </For>
              </fieldset>
              <Show when={!type()}>
                <div class="row">
                  <span class="grow">
                    Symbol in the pin <span class="muted">(optional)</span>
                  </span>
                  <IconPickButton icon={icon()} of="the waypoint" onChange={setIcon} />
                </div>
              </Show>
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

/** The route a waypoint draft belongs to. */
function routeOf(draft: WaypointDraft): string | undefined {
  return 'routeId' in draft ? draft.routeId : routeData.waypoints.find((w) => w.id === draft.id)?.routeId;
}
