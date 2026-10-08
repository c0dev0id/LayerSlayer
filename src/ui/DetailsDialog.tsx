import { createResource, createSignal, For, Match, Show, Switch, type JSX } from 'solid-js';
import { loadOsmFeatures, matchingFeature, type OsmFeature } from '../library/osmFeatures';
import { latLonText } from '../map/placeLinks';
import type { LngLat } from '../model/route';
import { findDetails, type DetailKind, type Details, type RowIcon } from '../services/osmDetails';
import { errorMessage } from '../state/ui';
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
import { showModalWhile } from './modal';

/** The spot whose details are asked for, and how far around it to look. */
const [request, setRequest] = createSignal<{ spot: LngLat; radius: number }>();

/** Opens the details of what lies at a spot: the nearest road or trail, place and barrier. */
export function showDetails(spot: LngLat, radius: number): void {
  setRequest({ spot, radius });
}

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
 * What OpenStreetMap knows of a spot, in a modal dialog: the nearest road or trail, place
 * and barrier, nearest first, each in words with the link to all its tags.
 */
export function DetailsDialog() {
  let dialog!: HTMLDialogElement;
  showModalWhile(() => dialog, () => request() !== undefined);
  const [found] = createResource(request, ({ spot, radius }) => findDetails(spot, radius));
  // The OSM presets give places and barriers their icons.
  const [presets] = createResource(() => request() !== undefined || undefined, loadOsmFeatures);

  return (
    <dialog ref={dialog} class="dialog details-dialog" aria-label="Details" onClose={() => setRequest(undefined)}>
      <div class="row dialog-title">
        <h2 class="grow">Details</h2>
        <button class="primary" onClick={() => setRequest(undefined)}>
          Close
        </button>
      </div>
      <Show when={request()}>
        {(r) => (
          <p class="muted hint">
            Near {latLonText(r().spot)}, within {Math.round(r().radius)} m
          </p>
        )}
      </Show>
      <div class="details">
        <Switch>
          <Match when={found.loading}>
            <p class="muted">Looking at OpenStreetMap…</p>
          </Match>
          <Match when={found.error as unknown}>
            <p class="note error">{errorMessage(found.error)}</p>
          </Match>
          <Match when={found()?.length === 0}>
            <p class="muted">No road or trail, place or barrier here. Zoom in closer, or right-click nearer to one.</p>
          </Match>
          <Match when={found()}>{(list) => <For each={list()}>{(details) => <DetailCard details={details} presets={presets()} />}</For>}</Match>
        </Switch>
      </div>
      <p class="muted hint">Data © OpenStreetMap contributors, found with the Overpass API.</p>
    </dialog>
  );
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
