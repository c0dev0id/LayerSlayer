import { createSignal, onCleanup, Show } from 'solid-js';
import { dataLabel, sourceFacts } from '../library/entryInfo';
import { hasPlaceholders } from '../map/urls';
import { SOURCE_KINDS, type Layer } from '../model/layer';
import { htmlText } from '../services/xml';
import { layerHost, proxiesHost, sourceUrl } from '../state/store';
import { CheckIcon, CopyIcon } from './icons';
import { splitOrigin } from './offers';

/** An address, linked where it is one a browser can open, and a button that copies it and shows a tick for a moment. */
export function AddressValue(props: { url: string }) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const copy = () =>
    navigator.clipboard?.writeText(props.url).then(
      () => {
        setCopied(true);
        clearTimeout(timer);
        timer = setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  return (
    <dd class="address-value">
      <Show when={!hasPlaceholders(props.url)} fallback={<span>{props.url}</span>}>
        <a href={props.url} target="_blank" rel="noopener">
          {props.url}
        </a>
      </Show>
      <button class="icon" title={copied() ? 'Copied' : 'Copy the address'} aria-label="Copy the address" onClick={() => void copy()}>
        <Show when={copied()} fallback={<CopyIcon />}>
          <CheckIcon />
        </Show>
      </button>
    </dd>
  );
}

/**
 * What a layer is, technically, as the add-layer list tells of a library entry: the
 * address it was added from, its place and name in the source (whatever it is called in
 * the list now), the kind of service, its data and format, and how it is fetched.
 */
export function LayerInfo(props: { layer: Layer }) {
  const layer = props.layer;
  const origin = () => (layer.origin ? splitOrigin(layer.origin) : undefined);
  const address = () => origin()?.address ?? sourceUrl(layer);
  const facts = () => sourceFacts(layer.source);
  const zooms = () => {
    const source = layer.source;
    if (!('maxzoom' in source) || (source.minzoom === undefined && source.maxzoom === undefined)) return undefined;
    return `${source.minzoom ?? 0}–${source.maxzoom ?? '…'}`;
  };
  return (
    <dl class="detail-rows layer-info">
      <Show when={address()}>
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
        {facts().version ? ` ${facts().version}` : ''}
      </dd>
      <Show when={facts().data.length > 0}>
        <dt>Data</dt>
        <dd>{dataLabel(facts().data)}</dd>
      </Show>
      <dt>Format</dt>
      <dd>{facts().format}</dd>
      <Show when={zooms()}>
        <dt>Tile zooms</dt>
        <dd>{zooms()}</dd>
      </Show>
      <Show when={layerHost(layer)}>
        <dt>Access</dt>
        <dd>{proxiesHost(layerHost(layer)) ? 'Through the CORS proxy' : 'Direct'}</dd>
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
