import { createEffect, createResource, For, Match, on, Show, Switch, type JSX } from 'solid-js';
import { loadOsmFeatures, matchingFeature, type OsmFeature } from '../library/osmFeatures';
import { latLonText } from '../map/placeLinks';
import type { LngLat } from '../model/route';
import type { DetailKind, Details, RowIcon } from '../services/osmDetails';
import { closeDetails, details, detailsRequest } from '../state/details';
import { errorMessage, map } from '../state/ui';
import {
  BarrierIcon,
  BothWaysIcon,
  ClockIcon,
  GaugeIcon,
  IconGlyph,
  KeyIcon,
  LockIcon,
  MapPinIcon,
  MountainIcon,
  OneWayIcon,
  PhoneIcon,
  RoadIcon,
  RulerIcon,
  TagIcon,
  TextureIcon,
  WaveIcon,
  WorldIcon,
} from './icons';
import { showWhile } from './modal';

const ROW_ICONS: Record<RowIcon, () => JSX.Element> = {
  ref: TagIcon,
  speed: GaugeIcon,
  oneway: OneWayIcon,
  bothways: BothWaysIcon,
  surface: TextureIcon,
  grade: MountainIcon,
  smoothness: WaveIcon,
  width: RulerIcon,
  access: KeyIcon,
  locked: LockIcon,
  address: MapPinIcon,
  phone: PhoneIcon,
  website: WorldIcon,
  hours: ClockIcon,
};

const KIND_ICONS: Record<DetailKind, () => JSX.Element> = { road: RoadIcon, poi: MapPinIcon, barrier: BarrierIcon };

/**
 * What OpenStreetMap knows of a spot, in a sheet beside the map, which stays usable: the
 * nearest road or trail, place and barrier, nearest first, each in words with the link to
 * all its tags. The map highlights them meanwhile, and another spot's details replace these.
 */
export function DetailsDialog() {
  let dialog!: HTMLDialogElement;
  showWhile(() => dialog, () => detailsRequest() !== undefined);
  // The OSM presets give places and barriers their icons.
  const [presets] = createResource(() => detailsRequest() !== undefined || undefined, loadOsmFeatures);
  // A spot under the sheet comes out beside it, so that its highlight shows.
  createEffect(on(detailsRequest, (request) => request && requestAnimationFrame(() => keepInView(request.spot, dialog))));

  return (
    <dialog
      ref={dialog}
      class="dialog details-dialog"
      aria-label="Details"
      onClose={closeDetails}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        closeDetails();
      }}
    >
      <div class="row dialog-title">
        <h2 class="grow">Details</h2>
        <button class="primary" onClick={closeDetails}>
          Close
        </button>
      </div>
      <Show when={detailsRequest()}>
        {(r) => (
          <p class="muted hint">
            Near {latLonText(r().spot)}, within {Math.round(r().radius)} m
          </p>
        )}
      </Show>
      <div class="details">
        <Switch>
          <Match when={details.loading}>
            <p class="muted">Looking at OpenStreetMap…</p>
          </Match>
          <Match when={details.error as unknown}>
            <p class="note error">{errorMessage(details.error)}</p>
          </Match>
          <Match when={details()?.length === 0}>
            <p class="muted">No road or trail, place or barrier here. Zoom in closer, or right-click nearer to one.</p>
          </Match>
          <Match when={details()}>{(list) => <For each={list()}>{(found) => <DetailCard details={found} presets={presets()} />}</For>}</Match>
        </Switch>
      </div>
      <p class="muted hint">Data © OpenStreetMap contributors, found with the Overpass API.</p>
    </dialog>
  );
}

/**
 * Pans the map so that the spot lies beside the sheet, where it lies in the sheet's column:
 * the sheet grows down as its results come in, so its height now says little.
 */
function keepInView(spot: LngLat, sheet: HTMLElement): void {
  const m = map();
  if (!m || !sheet.isConnected) return;
  const box = sheet.getBoundingClientRect();
  const canvas = m.getCanvas().getBoundingClientRect();
  const x = canvas.left + m.project(spot).x;
  if (x > box.right + 24) return;
  // Into the middle of the map to the right of the sheet.
  m.panBy([x - (box.right + canvas.right) / 2, 0]);
}

function DetailCard(props: { details: Details; presets: OsmFeature[] | undefined }) {
  const preset = () => (props.presets ? matchingFeature(props.presets, props.details.tags) : undefined);
  const KindIcon = KIND_ICONS[props.details.kind];
  return (
    <section class="detail-card">
      <div class="row">
        <span class="detail-icon">
          <Show when={preset()?.icon} fallback={<KindIcon />}>
            {(icon) => <IconGlyph icon={icon()} />}
          </Show>
        </span>
        <span class="grow">
          <strong>{props.details.title}</strong>
          <Show when={props.details.name}>
            {(name) => (
              <>
                <br />
                {name()}
              </>
            )}
          </Show>
        </span>
        <span class="muted distance">{Math.round(props.details.distance)} m</span>
      </div>
      <Show when={props.details.rows.length > 0}>
        <dl class="detail-rows">
          <For each={props.details.rows}>
            {(row) => {
              const Icon = ROW_ICONS[row.icon];
              return (
                <>
                  <dt>
                    <Icon />
                    {row.label}
                  </dt>
                  <dd>
                    <Show when={row.href} fallback={row.value}>
                      {(href) => (
                        <a href={href()} target="_blank" rel="noopener">
                          {row.value}
                        </a>
                      )}
                    </Show>
                  </dd>
                </>
              );
            }}
          </For>
        </dl>
      </Show>
      <a class="muted osm-link" href={props.details.url} target="_blank" rel="noopener">
        All of it on OpenStreetMap
      </a>
    </section>
  );
}
