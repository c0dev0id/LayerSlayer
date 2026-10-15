import { createResource, Show } from 'solid-js';
import { dataLabel, layerFacts, zoomRange } from '../library/entryInfo';
import { hasPlaceholders } from '../map/urls';
import { SOURCE_KINDS, type Layer } from '../model/layer';
import { htmlText } from '../services/xml';
import { layerHost, proxiesHost, sourceUrl } from '../state/store';
import { CopyButton } from './CopyButton';
import { splitOrigin } from './offers';

/** An address, linked where it is one a browser can open, with a button that copies it. */
export function AddressValue(props: { url: string }) {
  return (
    <dd class="address-value">
      <Show when={!hasPlaceholders(props.url)} fallback={props.url}>
        <a href={props.url} target="_blank" rel="noopener">
          {props.url}
        </a>
      </Show>
      <CopyButton text={props.url} label="Copy the address" />
    </dd>
  );
}

/** The address a layer was added from, or where none is known, the address its data comes from. */
export function layerAddress(layer: Layer): string | undefined {
  return layer.origin ? splitOrigin(layer.origin).address : sourceUrl(layer);
}

/**
 * What a layer is, technically, as the add-layer list tells of a library entry: the
 * address it was added from, its place and name in the source (whatever it is called in
 * the list now), the kind of service, its data and format, and how it is fetched. A
 * style's facts come from the style, which the map has loaded already.
 */
export function LayerInfo(props: { layer: Layer }) {
  const layer = props.layer;
  const origin = () => (layer.origin ? splitOrigin(layer.origin) : undefined);
  const host = () => layerHost(layer);
  const [facts] = createResource(() => layer.source, layerFacts);
  const zooms = () => ('maxzoom' in layer.source ? zoomRange(layer.source.minzoom, layer.source.maxzoom) : undefined);
  return (
    <dl class="detail-rows layer-info">
      <Show when={layerAddress(layer)}>
        {(url) => (
          <>
            <dt>Address</dt>
            <AddressValue url={url()} />
          </>
        )}
      </Show>
      <Show when={layer.originPath}>
        {(path) => (
          <>
            <dt>Layer</dt>
            <dd>{path().join(' › ')}</dd>
          </>
        )}
      </Show>
      <Show when={origin()?.name}>
        {(name) => (
          <>
            <dt>Name</dt>
            <dd>{name()}</dd>
          </>
        )}
      </Show>
      <dt>Service</dt>
      <dd>
        {SOURCE_KINDS[layer.source.type].label}
        {facts.state === 'ready' && facts().version ? ` ${facts().version}` : ''}
      </dd>
      <Show when={facts.state === 'ready' && facts()}>
        {(f) => (
          <>
            <Show when={f().data.length > 0}>
              <dt>Data</dt>
              <dd>{dataLabel(f().data)}</dd>
            </Show>
            <dt>Format</dt>
            <dd>{f().format}</dd>
          </>
        )}
      </Show>
      <Show when={zooms()}>
        <dt>Tile zooms</dt>
        <dd>{zooms()}</dd>
      </Show>
      <Show when={host()}>
        <dt>Access</dt>
        <dd>{proxiesHost(host()) ? 'Through the CORS proxy' : 'Direct'}</dd>
      </Show>
      <Show when={layer.attribution}>
        {(attribution) => (
          <>
            <dt>Attribution</dt>
            <dd>{htmlText(attribution())}</dd>
          </>
        )}
      </Show>
    </dl>
  );
}
